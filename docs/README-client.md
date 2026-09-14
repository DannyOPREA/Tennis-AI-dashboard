# Tennis AI Playground - User Guide

## What is this?

The Tennis AI Playground is a small program that runs on your own PC. You give it a short tennis video and a question (a "prompt", for example *"Describe the player's forehand technique and suggest two corrections"*), and it sends the video to several AI models at once: Google's Gemini models over the internet, and open-source vision models that run locally on your graphics card through a tool called Ollama. For every run it records what the model answered, how long it took, how many tokens it used and what it cost, and lets you give the answer a star rating. The Dashboard then compares the models side by side so we can decide which one gives the best coaching feedback for the price and speed.

## What you need

| Item | Needed |
|---|---|
| Operating system | Windows 11, 64-bit |
| Graphics card | NVIDIA with **16 GB of VRAM or more** (for example RTX 4080, 4070 Ti Super, 5080), with a recent driver. Only needed for the local models; Gemini works without it. |
| Free disk space | About **40 GB** (the app itself is small; the local models are 5-8 GB each, plus your videos) |
| Internet | Needed for the installation, for downloading the local models and every time a Gemini model runs |
| Gemini API key | **Danny gives it to you.** It is a long line of letters and numbers. You paste it once into the app. You do not need a Google account or any Google website for this. |

You do not need to install anything else by hand. The installer takes care of it.

## Installation (once)

1. **Download the installer.** Danny sends you a link to the "Releases" page of the project. Download the file named `TennisAI-Setup-<version>.exe` (for example `TennisAI-Setup-1.0.0.exe`).
2. **Open the downloaded file.** Windows shows a blue box saying **"Windows protected your PC"**. This is normal: the installer is not signed with a paid Microsoft certificate, so Windows does not recognise it yet. Click **More info**, then **Run anyway**.
3. **Follow the installer.** Choose the language, click **Next**, tick "Create a desktop icon" if you want one, click **Next**, then **Install**. No administrator password is needed: the app installs into your own user folder.
4. **Say Yes to Ollama.** If Ollama (the program that runs the local models) is not on your PC, the installer asks whether to download and install it. Answer **Yes**. It is about 1 GB and installs on its own. If you answer No, Gemini still works, but the local models will not.
5. **Click Finish.** The app starts by itself and your browser opens on the Welcome page.

If Windows asks a security question at any point, click **Yes** or **Allow**.

## First run: the Welcome page

The first time the app opens, it shows a Welcome page with three short steps. You can skip any step and come back to it later from the **Settings** page.

**Step 1 - Gemini key.** Paste the key Danny sent you into the box and click **Test connection**. After a few seconds you should see "Working" with the number of Gemini models available. If it says "Not working", check that you copied the whole key with no extra spaces, and that you are online.

**Step 2 - Local models.** Click **Download recommended models**. Each model is a few gigabytes; in total it is about **10 to 30 GB** and it can take from half an hour to several hours depending on your connection. Progress bars show where each download is. You do not have to wait: you can already use the Gemini models while the downloads run. Downloads continue in the background as long as the app is open.

**Step 3 - First video.** Click **Go to the Library** and upload a first clip. Use a clip of **30 to 90 seconds**, in MP4 or iPhone MOV format, filmed from behind or from the side of the court. Phone videos are converted automatically after the upload; this can take a minute.

When the three steps show "Done", click **Finish**.

## Daily use

### Starting and stopping

- Start the app from the **Start menu** (Tennis AI Playground) or from the **desktop icon**. Your browser opens on the playground after a few seconds.
- A small red-and-white ball icon appears in the **system tray** (bottom right, next to the clock; click the small arrow if it is hidden). The app keeps running there even if you close the browser tab.
- To get the page back, click the desktop icon again, or click the tray icon and choose **Open Tennis AI**. Clicking the icon twice does not start the app twice; it just opens the page.
- The tray menu also has **Open data folder** (where your videos and results live) and **Quit**, which stops the app completely.

### Working with videos and runs

1. **Library**: upload your videos here. Each video shows its length and whether it has been converted for playback.
2. **New run**: pick a video, then choose
   - the **prompt** (the question asked to the models; the Prompts page lists them and Danny can add more),
   - the **models** to compare (Gemini and local ones),
   - the **frame preset**: *Quick* (1 frame per second, up to 90 frames, for fast checks), *Light (16 GB)* (2 frames per second, up to 180 frames, the normal choice for your card), *Dense (24 GB)* (4 frames per second, up to 360 frames; only for small models or a bigger card, may run out of memory). Gemini models can also receive the whole video instead of frames.
   - **Blind rating**: when ticked, the model names stay hidden in Compare until you have rated each answer, so the names cannot influence you.
3. **Watch the runs.** Gemini answers in seconds. Local models take from one to several minutes each and run one after the other, so a batch of four local models takes a while.
4. **Compare and rate.** Open the batch, read each answer, and give it **1 to 5 stars**. Rate the coaching quality: is it accurate, specific and useful for the player?
5. **Dashboard.** Shows every finished run grouped by model: median cost, speed and your average rating, with filters by prompt, video and preset. This is the page that answers "which model should we use?".
6. **Export JSON.** On a batch or on the Dashboard, click **Export JSON** to save a file you can send to Danny (see the last section).

### Settings

The **Settings** page holds everything from the Welcome page and a few more things: the Gemini key, the list of local models (download, remove, see how much disk space they use), a **Computer name** written into every run so we know which PC produced it, and the **electricity price** per kWh used to estimate what a local run costs. It also shows the graphics card the app detected and where the data folder is.

## What the numbers mean

- **Tokens**: the units AI models read and write (roughly three quarters of a word, or a small patch of an image). Every frame of video costs tokens. More frames means more tokens, so more cost and more time.
- **Cost (USD)**: what the run cost on the provider's price list at the time of the run. Local models show a cost of 0; their electricity is estimated separately from the price you entered in Settings.
- **First token** (also "TTFT", time to first token): how long before the model starts answering. For a coaching app this is the waiting time the user feels.
- **Model time**: how long the model itself worked, from the request until the last word.
- **Total time**: everything included: uploading the video or extracting the frames, loading the model, and the model time.
- **Cold start**: the first run of a local model after Ollama starts has to load the model into the graphics card, which takes tens of seconds. Those runs are marked *cold* and are left out of the Dashboard by default, because they are not representative.
- **VRAM**: the memory of your graphics card. A model plus its frames must fit in it. If they do not, the run fails or becomes extremely slow.
- **Truncated**: the model hit its maximum answer length and stopped mid-sentence, or its input was cut short. The answer is incomplete; try a shorter prompt or a lower frame preset.

## Important caveats

- **No model can measure ball speed**, spin or exact distances. They describe what they see: posture, footwork, contact point, timing. Do not trust any km/h figure they write; it is a guess.
- **Keep clips between 30 and 90 seconds.** Longer clips cost more and take longer without giving better feedback. The frame presets cap the number of frames anyway.
- **Local models run one at a time.** They share the same graphics card, so a batch of 4 local models on 2 videos means 8 runs one after the other.
- **The first run of each local model is slow** (loading into VRAM). Ollama then keeps the model loaded for 30 minutes; runs within that window are fast.
- **Test for hallucination.** A good sanity check is to run a clip that has nothing to do with tennis (a street, a pet, an empty court) with the usual coaching prompt. A trustworthy model says it cannot see a tennis player; a bad one invents a forehand analysis anyway.
- Gemini runs send the video to Google. Avoid videos of people who have not agreed to it.

## Troubleshooting

| Problem | What to do |
|---|---|
| The app does not open, or the browser shows "cannot connect" | Look for the ball icon in the system tray (click the small arrow next to the clock). If it is there, click it and choose **Open Tennis AI**. If it is not there, start the app again from the Start menu. If it still fails, send Danny the file `app.log` from the `logs` folder inside the data folder (see "Where your data lives" below). |
| "Ollama unreachable" or "Ollama is not running" | Start **Ollama** from the Start menu; a llama icon appears in the tray. Then click **Refresh** on the Settings page. If Ollama is not in the Start menu, install it from <https://ollama.com/download>, then restart the Tennis AI app. |
| A model download failed or stopped | Open **Settings**, find the model and click **Download** again; it continues where it left off. Check the free disk space shown on the same page: each model needs a few GB free. |
| A run fails with "out of memory", "CUDA" or "VRAM", or the PC becomes very slow | The model and its frames do not fit in the graphics card. Use the **Light (16 GB)** or **Quick** preset, choose a smaller model, and close other programs that use the graphics card (games, video editors). |
| Gemini error "API key not valid", 400 or 403 | The key is wrong or has expired. Open **Settings**, paste the key again and click **Test connection**. If it still fails, ask Danny for a new key. |
| Gemini error 429, "quota" or "RESOURCE_EXHAUSTED" | Too many requests in a short time, or the key's monthly budget is used up. Wait a minute and retry; if it keeps happening, tell Danny. |
| Gemini error mentioning "network", "timeout" or "connection" | Check that you are online. Gemini needs the internet; local models do not. |
| "Port 8000 is already in use" | Another copy of the app is probably running: look for the tray icon and use it. If another program uses port 8000, close it or restart the PC. |
| The app behaves strangely and you want a clean restart | Click the tray icon, choose **Quit**, wait a few seconds, then start the app again from the Start menu. If the tray icon has disappeared, restart the PC. |
| Anything else | Send Danny a screenshot of the error and the `app.log` file from the `logs` folder inside the data folder. |

### Where your data lives

Everything the app produces is in the **data folder**: your videos, the extracted frames, the results database and the logs. The quickest way to open it is the tray icon, **Open data folder**, or the "Tennis AI data folder" shortcut in the Start menu. Its full location is `C:\Users\<your name>\AppData\Local\TennisAI\data` and it is also shown on the Settings page.

Inside it:

- `videos` - your uploaded videos
- `frames` - frames extracted for the local models (can be deleted if you need space)
- `logs` - `app.log` and older copies, useful when something goes wrong
- `playground.db` - the database with all runs, timings, costs and your ratings

**To back up**: quit the app from the tray icon, then copy the whole data folder to an external drive or a cloud folder. To restore it, copy it back to the same place before starting the app.

Your Gemini key is stored in a small settings file next to the data folder. Never send that file to anyone.

### Uninstalling

Open **Windows Settings > Apps > Installed apps** (or "Apps & features"), find **Tennis AI Playground** and click **Uninstall**. This removes the program but **keeps the data folder** with your videos and results, so nothing is lost if you reinstall later. Delete the data folder yourself if you want to free the space. Ollama and the downloaded models are separate: uninstall Ollama from the same Apps list if you no longer need it.

### Updating

Danny sends a link to a new installer when there is an update. Quit the app from the tray icon, run the new installer exactly like the first time, and click **Yes** if Windows asks about replacing the previous version. Your data and settings are kept.

## Sending results to Danny

1. Open the **Dashboard** page, or open the batch you want to share from the **Batches** page.
2. Click **Export JSON**. The file contains the runs, timings, costs, your ratings and the prompt used. It does not contain the video itself.
3. Send the JSON file(s) to Danny by e-mail or a shared drive.
4. If a run failed and you want help, also attach the `app.log` file from the `logs` folder inside the data folder, and say which video and models you used.
