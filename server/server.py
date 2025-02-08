# server.py
import os
import re
import math
import json
import traceback
import yt_dlp

# --------------------------------------------
# 1) Use the recommended OpenAI import & usage
# --------------------------------------------
import openai

# Set your API key properly:
# Option A: Hard-code your key for testing (NOT RECOMMENDED for production)
#openai.api_key = "sk-proj-..."  # Replace with your actual key

# Option B (better): use an environment variable named OPENAI_API_KEY
openai.api_key = os.environ.get("OPENAI_API_KEY")

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

# For transcripts
from youtube_transcript_api import (
    YouTubeTranscriptApi,
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable,
)

# For video editing
# ---------------------------------------------------------
# 2) Import VideoFileClip & concatenate_videoclips from the
#    *editor* submodule, not from moviepy top-level.
# ---------------------------------------------------------
from moviepy import VideoFileClip, concatenate_videoclips
###############################################################################
# 1) FLASK SETUP
###############################################################################

app = Flask(__name__)
CORS(app)  # Allow cross-origin from React dev server

OUTPUT_DIR = "output_videos"
os.makedirs(OUTPUT_DIR, exist_ok=True)

###############################################################################
# 2) HELPER FUNCTIONS
###############################################################################

def extract_video_id(youtube_url: str) -> str:
    """
    Attempt to extract the video ID from a typical YouTube URL.
    """
    short_link_match = re.match(r".*youtu\.be/([^?&]+)", youtube_url)
    if short_link_match:
        return short_link_match.group(1)

    watch_match = re.match(r".*v=([^&]+)", youtube_url)
    if watch_match:
        return watch_match.group(1)

    shorts_match = re.match(r".*youtube\.com/shorts/([^?&]+)", youtube_url)
    if shorts_match:
        return shorts_match.group(1)

    # If unable to parse:
    return None

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
    Break the transcript into smaller pieces if needed (to handle large context).
    max_chunk_size = number of words per chunk approx.
    Returns a list of 'chunks'; each chunk is {text, start, end}
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

        # If adding this segment exceeds max_chunk_size, finalize the current chunk
        if word_count + len(words) > max_chunk_size and current_chunk_text:
            chunk_text = " ".join(current_chunk_text)
            chunks.append({
                "text": chunk_text,
                "start": current_chunk_start,
                "end": current_chunk_end
            })
            current_chunk_text = []
            word_count = 0
            current_chunk_start = seg['start']

        current_chunk_text.append(segment_text)
        word_count += len(words)
        current_chunk_end = seg['start'] + seg['duration']

    # Add the last chunk
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
    Get embedding from OpenAI. 
    Newer openai>=1.0.0 usage requires input as a list if using openai.Embedding.
    """
    response = openai.Embedding.create(
        input=[text],  # must be a LIST
        model="text-embedding-ada-002"
    )
    return response["data"][0]["embedding"]

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
    Download a YouTube video using yt-dlp
    """
    url = f"https://www.youtube.com/watch?v={video_id}"
    
    ydl_opts = {
        'outtmpl': output_path,  # e.g. "output_videos/video_id.mp4"
        'format': 'mp4/best'
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

def refine_snippets_order(snippets, user_query):
    """
    Use an LLM to reorder the snippet text into a cohesive story.
    We'll simply feed the snippet texts + original order to GPT and ask for
    a re-ordered list of snippet indexes and a short reason.
    """
    prompt_text = f"User query: '{user_query}'\n"
    prompt_text += "We have the following snippet texts:\n"
    for i, s in enumerate(snippets):
        snippet_text = s['text']
        prompt_text += f"({i}): {snippet_text}\n"
    prompt_text += (
        "Reorder these snippets into a cohesive narrative. "
        "Return a JSON list of indices in the desired order, and briefly explain why."
    )

    try:
        completion = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are an assistant that returns JSON only."},
                {"role": "user", "content": prompt_text}
            ],
            temperature=0.3
        )
        raw_response = completion.choices[0].message['content']

        data = json.loads(raw_response)
        new_order = data.get("order", list(range(len(snippets))))
        return new_order
    except:
        traceback.print_exc()
        # If something goes wrong, just return original order
        return list(range(len(snippets)))

###############################################################################
# 3) FLASK ROUTES
###############################################################################

@app.route("/api/transcript-chunks", methods=["POST"])
def route_transcript_chunks():
    try:
        data = request.json
        youtube_url = data.get("youtubeUrl")
        max_chunk_size = data.get("maxChunkSize", 200)

        if not youtube_url:
            return jsonify({"error": "No YouTube URL provided"}), 400

        video_id = extract_video_id(youtube_url)
        if not video_id:
            return jsonify({"error": "Invalid YouTube URL"}), 400

        transcript = fetch_full_transcript(video_id)  # may raise exception
        chunks = chunk_transcript(transcript, max_chunk_size)
        return jsonify({"chunks": chunks})

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

        # 2) Embed each chunk & compute similarity
        scored_chunks = []
        for i, c in enumerate(chunks):
            c_embedding = get_openai_embedding(c["text"])
            similarity = cosine_similarity(query_embedding, c_embedding)
            c["similarity"] = similarity
            c["index"] = i
            scored_chunks.append(c)

        # 3) Sort by similarity & pick top K
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
        snippet_list = data["snippets"]

        if not youtube_url:
            return jsonify({"error": "No YouTube URL provided"}), 400

        video_id = extract_video_id(youtube_url)
        if not video_id:
            return jsonify({"error": "Invalid YouTube URL"}), 400

        # Download the original video if not already downloaded
        temp_video_path = os.path.join(OUTPUT_DIR, f"{video_id}.mp4")
        if not os.path.isfile(temp_video_path):
            download_video(video_id, temp_video_path)

        # Load with MoviePy's VideoFileClip
        source_clip = VideoFileClip(temp_video_path)
        subclips = []

        for snip in snippet_list:
            start = float(snip["start"]) + float(snip.get("shiftStart", 0))
            end = float(snip["end"]) + float(snip.get("shiftEnd", 0))

            # Ensure times are within the video duration
            start = max(0, start)
            end = min(source_clip.duration, end)

            if end > start:
                # MoviePy's subclip() is available only on a valid VideoFileClip
                snippet_clip = source_clip.subclipped(start, end)
                subclips.append(snippet_clip)

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
