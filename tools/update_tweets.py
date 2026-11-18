#!/usr/bin/env python3
import json
import os
import random
import re
import subprocess
import sys
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

# --------- CONFIG ---------
NITTER_BASE = os.environ.get("NITTER_BASE", "https://nitter.net")
USERNAME = os.environ.get("X_USERNAME", "yweng30")  # no @
MAX_TWEETS = int(os.environ.get("MAX_TWEETS", "1"))
INDEX_HTML = os.environ.get("INDEX_HTML", "index.html")  # path to your file
GIT_COMMIT_PREFIX = os.environ.get("COMMIT_PREFIX", "Update embedded tweet")
# --------------------------

NITTER_INSTANCES = [
    "https://nitter.net",
    "https://nitter.privacydev.net",
    "https://nitter.fdn.fr",
    "https://nitter.poast.org",
]

import random
import time
import requests
import xml.etree.ElementTree as ET

def fetch_latest_from_nitter_rss_rotating(instances, username, max_tweets):
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }

    def get_with_backoff(url, tries=3):
        for i in range(tries):
            r = requests.get(url, headers=headers, timeout=20)
            if r.status_code == 429:
                wait = (2 ** i) * 5 + random.uniform(0, 3)
                print(f"429 from {url}. Sleep {wait:.1f}s then retry...")
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r
        raise RuntimeError(f"429 persisted: {url}")

    random.shuffle(instances)

    last_err = None
    for base in instances:
        rss_url = f"{base.rstrip('/')}/{username}/rss"
        try:
            r = get_with_backoff(rss_url, tries=2)
            txt = r.text
            if "<rss" not in txt[:800].lower():
                raise RuntimeError(f"Not RSS (maybe blocked). Head: {txt[:120].replace(chr(10),' ')}")

            root = ET.fromstring(txt)
            channel = root.find("channel")
            if channel is None:
                raise RuntimeError("RSS missing <channel>.")
            items = channel.findall("item")
            tweets = []
            for it in items[:max_tweets]:
                title = (it.findtext("title") or "").strip()
                link = (it.findtext("link") or "").strip()
                pub = (it.findtext("pubDate") or "").strip()
                if title and link:
                    tweets.append({"text": title, "url": link, "date": pub})
            if not tweets:
                raise RuntimeError("RSS parsed but no items.")
            print(f"Fetched {len(tweets)} tweets from {base}")
            return tweets

        except Exception as e:
            last_err = e
            print(f"Failed on {base}: {e}")

    raise RuntimeError(f"All Nitter instances failed. Last error: {last_err}")



def run_git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], check=True, text=True, capture_output=True)


def extract_status_id(nitter_url: str) -> str:
    """
    Extract the numeric tweet ID from URLs like:
    https://nitter.net/yweng30/status/2021655484890226756#m
    """
    m = re.search(r"/status/(\d+)", nitter_url)
    if not m:
        raise ValueError(f"Cannot find /status/<id> in url: {nitter_url}")
    return m.group(1)


def update_index_html(index_path: str, username: str, new_id: str) -> bool:
    """
    Replaces the status ID in:
      <blockquote class="twitter-tweet"><a href="https://twitter.com/<username>/status/<ID>?ref_src=..."></a></blockquote>

    Returns True if a replacement happened, False otherwise.
    """
    with open(index_path, "r", encoding="utf-8") as f:
        html = f.read()

    # Match the specific twitter embed anchor for this username
    # and capture prefix + old_id + suffix so we only replace the ID.
    pattern = re.compile(
        rf'(https://twitter\.com/{re.escape(username)}/status/)(\d+)(\?ref_src=[^"]*)',
        re.IGNORECASE
    )
    def repl(m):
        return f"{m.group(1)}{new_id}{m.group(3)}"

    m = pattern.search(html)
    if not m:
        raise RuntimeError(
            f"Could not find twitter embed URL for username='{username}' "
            f"in {index_path}. Expected something like "
            f"https://twitter.com/{username}/status/<ID>?ref_src=..."
        )

    old_id = m.group(2)
    if old_id == new_id:
        print(f"No change needed: index.html already uses tweet id {new_id}")
        return False

    new_html, n = pattern.subn(repl, html, count=1)
    if n == 0:
        raise RuntimeError("No replacement made (pattern not found).")

    with open(index_path, "w", encoding="utf-8") as f:
        f.write(new_html)

    print(f"Replaced tweet id: {old_id} -> {new_id} in {index_path}")
    return True


def run():
    tweets = fetch_latest_from_nitter_rss_rotating(
        instances=NITTER_INSTANCES,
        username=USERNAME,
        max_tweets=MAX_TWEETS
    )
    post_id = extract_status_id(tweets[0]["url"])
    if post_id:
        print("========== SUCCESS ===========", post_id)
        changed = update_index_html(INDEX_HTML, USERNAME, post_id)
        if not changed:
            print("========== Failed at Updating index.html ===========")
            return
    
    # git add/commit/push
    run_git("add", INDEX_HTML)
    # If nothing staged, do nothing (safety)
    diff = subprocess.run(["git", "diff", "--cached", "--quiet"])
    if diff.returncode == 0:
        print("Nothing to commit after edit (unexpected).")
        return

    msg = f"update tweet embed"
    run_git("commit", "-m", msg)
    run_git("push")
    print("Committed and pushed.")

if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        print("ERROR:", e, file=sys.stderr)
        sys.exit(1)
