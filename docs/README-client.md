# Tennis AI Playground - User Guide

## What is this?

The Tennis AI Playground is a small program that runs on your own PC. You give it a short tennis video and a question (a "prompt", for example *"Describe the player's forehand technique and suggest two corrections"*), and it sends the video to several AI models at once: Google's Gemini models over the internet, and open-source vision models that run locally on your graphics card through a tool called Ollama. For every run it records what the model answered, how long it took, how many tokens it used and what it cost, and lets you give the answer a star rating. The Dashboard then compares the models side by side so we can decide which one gives the best coaching feedback for the price and speed.

## Requirements

| Item | Needed |
|---|---|
| Operating system | Windows 11 (Windows 10 also works) |
| Graphics card | NVIDIA with **16 GB of VRAM or more** (e.g. RTX 4080 / 4070 Ti Super / 5080), recent driver |
| Free disk space | About **40 GB** (local models are 5-8 GB each, plus videos and extracted frames) |
| Internet | Needed for installation, for downloading models and for the Gemini models |
| Gemini API key | Create one at <https://aistudio.google.com/apikey>. **Use the paid tier** (add billing in Google AI Studio): the free tier may use your uploaded videos to train Google's models and its rate limits are unpredictable, so runs would randomly fail. |

You do **not** need to install Python, Node or anything else by hand - the installer does it.

## Installation (once)

1. **Download** the zip file from the GitHub release page that Danny sent you, and extract it to a simple folder without accents or spaces if possible, for example `C:\TennisAI`.
2. **Unblock the files.** Windows marks files downloaded from the internet as "blocked". Either right-click the zip *before* extracting it, choose **Properties**, tick **Unblock**, click OK; or after extracting, open PowerShell in the folder and run:
   ```powershell
   Get-ChildItem -Recurse | Unblock-File
   ```
3. **Open PowerShell in the project folder**: in File Explorer, open `C:\TennisAI`, click in the address bar, type `powershell` and press Enter.
4. **Run the installer**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\install.ps1
   ```
   It installs `uv` (Python manager), FFmpeg (video tool) and Ollama (local models), then prepares the project. Answer the questions:
   - Windows may show a blue "User Account Control" window for each installer: click **Yes**.
   - When asked for the **Gemini API key**, paste it (right-click in the window) and press Enter. Nothing appears while you type; that is normal.
   - At the end, answer **y** to download the local models straight away (about 25-30 GB; can take from 20 minutes to a few hours depending on your connection), or **N** to do it later.
5. If the installer says so, **quit and relaunch Ollama**: right-click the Ollama icon in the system tray (bottom-right, near the clock), choose *Quit Ollama*, then start *Ollama* from the Start menu.
6. **Download the local models** (if you answered N above):
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\pull-models.ps1
   ```
   You can run this again at any time; it only downloads what is missing.

Everything is safe to run again if something goes wrong: the scripts skip what is already done.

## Daily use

1. Double-click **`scripts\run.cmd`**. A black window opens and shows the server's messages; after a few seconds your browser opens on <http://127.0.0.1:8000>. Keep the black window open while you work (closing it, or pressing Ctrl+C in it, stops the playground).
2. **Upload a video** (Videos page). MP4 or MOV, ideally 30-90 seconds, filmed from behind or from the side of the court.
3. **Create a batch**: choose the video, the **prompt** (the question asked to the models), the **models** to compare, and a **frame preset**:
   - *Quick*: 1 frame per second, max 90 frames - fast sanity checks.
   - *Light (16 GB)*: 2 fps, max 180 frames - the normal setting for your card.
   - *Dense (24 GB)*: 4 fps, max 360 frames - only for small models or a bigger card; may run out of memory.
   Gemini models can also receive the **native video** instead of frames.
4. **Watch the runs** progress. Gemini runs finish in seconds; local models take from one to several minutes each and run one after the other.
5. **Rate the outputs**: read each answer and give it 1-5 stars (optionally in "blind" mode where the model names are hidden until you have rated).
6. **Read the Dashboard**: it groups the finished runs by model and shows the median cost, speed and your ratings, with filters by prompt, video and preset.

## What the numbers mean

- **Tokens**: the units AI models read and write (roughly 3/4 of a word, or a small patch of image). Every frame of video costs tokens; more frames = more tokens = more cost and time.
- **Cost (USD)**: what the run cost on the provider's price list at the time of the run. Local models show 0 (they only cost electricity, estimated separately).
- **TTFT** (time to first token): how long before the model starts answering. For a coaching tool this is the "waiting" time the user feels.
- **Model time**: how long the model itself worked, from the request to the last word.
- **Total time**: everything included - uploading the video or extracting frames, loading the model, the model time.
- **Cold start**: the first run of a local model after Ollama starts has to load the model into the graphics card (tens of seconds). Those runs are marked *cold* and excluded from the Dashboard by default, because they are not representative.
- **VRAM**: the memory of your graphics card. A model plus its frames must fit in it; if they do not, the run fails or becomes extremely slow.
- **Truncated**: the model hit its maximum answer length and stopped mid-sentence. The answer is incomplete; try a shorter prompt or a lower frame preset.

## Important caveats

- **Video models cannot measure ball speed**, spin rate or exact distances. They describe what they see (posture, footwork, contact point, timing). Do not trust any number of km/h they might write.
- **Keep clips between 30 and 90 seconds.** Longer clips cost more, take longer and do not give better feedback; the frame presets cap the number of frames anyway.
- **iPhone videos (HEVC / .MOV) are converted automatically** by FFmpeg when you upload them. This can take a minute for a long clip.
- **Local models run one at a time.** They share the same graphics card, so a batch of 4 local models on 2 videos means 8 runs one after the other.
- **The first run of each local model is slow** (loading into VRAM). Ollama then keeps the model loaded for 30 minutes; runs within that window are fast.
- Gemini runs send the video to Google. Use the paid tier (see Requirements) and avoid videos of people who have not agreed to it.

## Troubleshooting

| Symptom | What to do |
|---|---|
| Local models fail with "Ollama not reachable" | Ollama is not running. Start *Ollama* from the Start menu (an icon appears in the system tray), then retry the run. If it was running, right-click the tray icon, *Quit Ollama*, and start it again. |
| Run fails with an "out of memory" / CUDA / VRAM error, or the PC becomes very slow | The model and frames do not fit in the graphics card. Use the **Light (16 GB)** or **Quick** preset, choose a smaller model, close other GPU programs (games, video editors), and make sure no other model is loaded. |
| Gemini error **429**, "quota", "RESOURCE_EXHAUSTED" | You are sending requests faster than your Google plan allows, or billing is not enabled. Wait a minute and retry; check the API key is on the paid tier at <https://aistudio.google.com/>. |
| Gemini error 400/403, "API key not valid" | The key in `.env` is wrong or expired. Open `.env` (in the project folder) with Notepad, fix `GEMINI_API_KEY=...`, save, restart the playground. |
| "Port 8000 is already in use" or the browser shows another program | The playground is probably already running in another window: use that one, or close it. If another program uses port 8000, close it or reboot. |
| The browser does not open | Open it yourself and go to <http://127.0.0.1:8000>. |
| The black window closes immediately or shows red text | Run the diagnostics (below) and send Danny the latest log file from `data\logs\` (files are named `playground-<date>-<time>.log`). |
| Anything else | Run the diagnostics: open PowerShell in the project folder and type `powershell -ExecutionPolicy Bypass -File scripts\doctor.ps1`. Each line is green (OK) or red (problem) with a hint. Send a screenshot to Danny. |

Where things live:

- `.env` - your settings and API key (never send this file to anyone).
- `data\videos\` - uploaded videos; `data\frames\` - extracted frames; `data\logs\` - server logs; `data\playground.db` - the results database.
- `playground\registry\models.yaml` - the list of models and prices (Danny maintains it).

## Sending results to Danny

1. Open the **Dashboard** page.
2. Open the batch you want to share (or the batches list) and click **Export JSON**. The file contains the runs, timings, costs, your ratings and the prompt used - but not the video itself.
3. Send the JSON file(s) to Danny by e-mail or shared drive. If a run failed and you want help, also attach the latest file from `data\logs\`.
