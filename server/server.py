import os
import re
import math
import json
import tempfile
from openai import OpenAI
import yt_dlp
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
import traceback

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

# For transcripts
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound, VideoUnavailable

# For video editing
from moviepy import VideoFileClip, concatenate_videoclips


###############################################################################
# 1) FLASK SETUP
###############################################################################

app = Flask(__name__)
CORS(app)  # Allow cross-origin from React dev server


# You might prefer to store final videos somewhere else
OUTPUT_DIR = "output_videos"
os.makedirs(OUTPUT_DIR, exist_ok=True)

###############################################################################
# 2) HELPER FUNCTIONS
###############################################################################

def extract_video_id(youtube_url):
    """
    Extracts the video id from a YouTube URL.
    Adjust this regex if you need to support more URL formats.
    """
    regex = r'(?:\?v=|\/embed\/|\.be\/)([a-zA-Z0-9_-]{11})'
    match = re.search(regex, youtube_url)
    return match.group(1) if match else None


def fetch_full_transcript(video_id: str):
    """
    Retrieve entire transcript (in English) for a given YouTube video_id.
    Returns a list of dicts: [{start, duration, text}, ...]
    """
    try:
        transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=['en'])
        return transcript
    except TranscriptsDisabled:
        raise Exception("Transcripts are disabled for this video.")
    except NoTranscriptFound:
        raise Exception("No transcript found for this video.")
    except VideoUnavailable:
        raise Exception("Video is unavailable or private.")
    except Exception as e:
        raise e

def chunk_transcript(transcript, max_chunk_size=200):
    """
    Break the transcript into smaller pieces if needed.
    max_chunk_size = approximate number of words per chunk.
    Returns a list of chunks; each chunk is a dict with {text, start, end}.
    """
    chunks = []
    current_chunk_text = []
    current_chunk_start = None
    current_chunk_end = None
    word_count = 0

    for seg in transcript:
        segment_text = seg['text']
        words = segment_text.split()

        if current_chunk_start is None:
            current_chunk_start = seg['start']

        # If adding this segment would exceed the chunk size, finalize the current chunk.
        if word_count + len(words) > max_chunk_size and current_chunk_text:
            chunk_text = " ".join(current_chunk_text)
            chunks.append({
                "text": chunk_text,
                "start": current_chunk_start,
                "end": current_chunk_end
            })
            # Start a new chunk
            current_chunk_text = []
            word_count = 0
            current_chunk_start = seg['start']

        current_chunk_text.append(segment_text)
        word_count += len(words)
        current_chunk_end = seg['start'] + seg['duration']

    # Add the last chunk if it exists.
    if current_chunk_text:
        chunk_text = " ".join(current_chunk_text)
        chunks.append({
            "text": chunk_text,
            "start": current_chunk_start,
            "end": current_chunk_end
        })

    return chunks

def get_openai_embedding(text):
    """
    Get embedding from OpenAI. Using text-embedding-ada-002 by default.
    """
    response = client.embeddings.create(input=text,
    model="text-embedding-ada-002")
    return response.data[0].embedding

def cosine_similarity(vec_a, vec_b):
    if len(vec_a) != len(vec_b):
        return 0
    dot_product = sum(a*b for a,b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a*a for a in vec_a))
    norm_b = math.sqrt(sum(b*b for b in vec_b))
    if norm_a == 0 or norm_b == 0:
        return 0
    return dot_product / (norm_a * norm_b)

def download_video(video_id, output_path):
    """
    Downloads a YouTube video using yt-dlp
    :param video_id: YouTube video ID
    :param output_path: Where to save the .mp4 file
    """
    url = f"https://www.youtube.com/watch?v={video_id}"
    
    # The 'outtmpl' option sets the target filename (including extension).
    ydl_opts = {
        'outtmpl': output_path,  
        'format': 'mp4/best'     
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

def refine_snippets_order(snippets, user_query):
    """
    Use an LLM to refine or reorder the snippet text into a cohesive story.
    We'll simply feed the snippet texts + original order to GPT and ask for
    a re-ordered list of snippet indexes and a short reason.

    Note: This is a basic demonstration. You could also ask for merges, rewrites, etc.
    """
    prompt_text = "User query: '{}'\n".format(user_query)
    prompt_text += "We have the following snippet texts (in the order we found them):\n"
    for i, s in enumerate(snippets):
        snippet_text = s['text']
        prompt_text += f"({i}): {snippet_text}\n"
    prompt_text += (
        "Reorder these snippets into a cohesive narrative. "
        "Return a JSON list of indices in the desired order, and briefly explain why."
    )

    try:
        completion = client.chat.completions.create(model="gpt-4",
        messages=[{"role": "system", "content": "You are an assistant that returns JSON only."},
                  {"role": "user", "content": prompt_text}],
        temperature=0.3)
        raw_response = completion.choices[0].message.content

        data = json.loads(raw_response)
        new_order = data.get("order", list(range(len(snippets))))
        return new_order
    except:
        traceback.print_exc()
        # If something goes wrong, just return in original order
        return list(range(len(snippets)))

###############################################################################
# 3) FLASK ROUTES
###############################################################################

@app.route("/api/transcript-chunks", methods=["POST"])
def route_transcript_chunks():
    try:
        data = request.json
        max_chunk_size = data.get("maxChunkSize", 200)

        # Check for an array of URLs, otherwise fall back to a single URL.
        youtube_urls = data.get("youtubeUrls")
        if youtube_urls:
            if not isinstance(youtube_urls, list):
                return jsonify({"error": "youtubeUrls must be an array"}), 400
        else:
            youtube_url = data.get("youtubeUrl")
            if not youtube_url:
                return jsonify({"error": "No YouTube URL provided"}), 400
            youtube_urls = [youtube_url]

        aggregated_chunks = []
        for youtube_url in youtube_urls:
            video_id = extract_video_id(youtube_url)
            if not video_id:
                return jsonify({"error": f"Invalid YouTube URL: {youtube_url}"}), 400

            # Fetch transcript for the video.
            transcript = fetch_full_transcript(video_id)
            # Chunk the transcript.
            chunks = chunk_transcript(transcript, max_chunk_size)
            # Optionally tag each chunk with video info.
            for chunk in chunks:
                chunk['youtubeUrl'] = youtube_url
                chunk['videoId'] = video_id

            aggregated_chunks.extend(chunks)

        return jsonify({"chunks": aggregated_chunks})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/search-snippets", methods=["POST"])
def route_search_snippets():
    try:
        data = request.json
        chunks = data["chunks"]
        user_query = data["query"]
        top_k = int(data.get("topK", 5))

        # 1) Embed user query
        query_embedding = get_openai_embedding(user_query)

        # 2) Embed each chunk
        scored_chunks = []
        for i, c in enumerate(chunks):
            c_embedding = get_openai_embedding(c["text"])
            similarity = cosine_similarity(query_embedding, c_embedding)
            c["similarity"] = similarity
            c["index"] = i
            scored_chunks.append(c)

        # 3) Sort by similarity
        scored_chunks.sort(key=lambda x: x["similarity"], reverse=True)
        top_results = scored_chunks[:top_k]

        return jsonify({"results": top_results})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/refine-snippets", methods=["POST"])
def route_refine_snippets():
    try:
        data = request.json
        snippets = data["snippets"]
        user_query = data["query"]

        new_order = refine_snippets_order(snippets, user_query)
        return jsonify({"order": new_order})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/create-video", methods=["POST"])
def route_create_video():
    try:
        data = request.json
        youtube_url = data["youtubeUrl"]
        snippet_list = data["snippets"]  # Each snippet includes 'start', 'end', etc.

        if not youtube_url:
            return jsonify({"error": "No YouTube URL provided"}), 400

        video_id = extract_video_id(youtube_url)
        if not video_id:
            return jsonify({"error": "Invalid YouTube URL"}), 400

        # Download the video
        temp_video_path = os.path.join(OUTPUT_DIR, f"{video_id}.mp4")
        if not os.path.isfile(temp_video_path):
            download_video(video_id, temp_video_path)

        source_clip = VideoFileClip(temp_video_path)
        subclips = []

        for snip in snippet_list:
            start = float(snip["start"]) + float(snip.get("shiftStart", 0))
            end = float(snip["end"]) + float(snip.get("shiftEnd", 0))

            # Clamp the times within the video length
            start = max(0, start)
            end = min(source_clip.duration, end)

            if end > start:
                subclip = source_clip.subclipped(start, end)
                subclips.append(subclip)

        if not subclips:
            source_clip.close()
            return jsonify({"error": "No valid subclips found"}), 400

        final_clip = concatenate_videoclips(subclips)
        out_path = os.path.join(OUTPUT_DIR, f"highlight_{video_id}.mp4")
        final_clip.write_videofile(out_path, codec="libx264", audio_codec="aac")

        # Cleanup
        source_clip.close()
        for c in subclips:
            c.close()

        return jsonify({"videoPath": out_path})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/download-video/<path:filepath>", methods=["GET"])
def route_download_video_file(filepath):
    if not filepath.startswith(OUTPUT_DIR):
        filepath = os.path.join(OUTPUT_DIR, filepath)

    full_path = filepath
    if os.path.isfile(full_path):
        return send_file(full_path, as_attachment=True)
    else:
        return jsonify({"error": "File not found"}), 404


###############################################################################
# RUN FLASK
###############################################################################
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)