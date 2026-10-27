# Complete Guide: Managing, Updating, Building, and Releasing SVG Animator Studio

This comprehensive operational guide covers routine dual-repo synchronization (Gitea and GitHub), document management for releases, rebuilding multi-platform binaries from source, publishing official releases on GitHub, and scrubbing accidentally tracked files from Git history.

---

### Step 1: Document Release Notes
Before committing changes, summarize your updates in a release document or changelog.

1. Open or create the release notes file in your project root:
   nano RELEASE_NOTES.md

2. Add your changelog details, save the file (Ctrl+O, Enter), and exit (Ctrl+X).

---

### Step 2: Routine Push to Gitea and GitHub
Follow these steps for standard daily commits and synchronization across both remotes.

1. Stage all tracked and untracked modifications:
   git add .

2. Commit the staged changes with a descriptive message:
   git commit -m "Update project features and add release notes"

3. Push to your local Gitea instance (origin):
   git push origin main
   (Verification: The terminal reports objects written and references updated without errors.)

4. Push to GitHub (github):
   git push github main
   (Verification: The terminal confirms changes were pushed to github.com/elric-seaoffate.)

---

### Step 3: Rebuilding Windows and Linux Binaries
When pre-compiled binaries are deleted or code has changed, cross-compile fresh executables directly from the project directory.

1. Navigate to the project root and ensure the target output folder exists:
   cd ~/projects/svg-animator
   mkdir -p bin

2. Compile the 64-bit Linux binary:
   GOOS=linux GOARCH=amd64 go build -o bin/svg-animator-linux ./cmd/svg-animator
   (Verification: Run `file bin/svg-animator-linux` to confirm it outputs `ELF 64-bit LSB executable`.)

3. Compile the 64-bit Windows executable:
   GOOS=windows GOARCH=amd64 go build -o bin/svg-animator-windows.exe ./cmd/svg-animator
   (Verification: Run `file bin/svg-animator-windows.exe` to confirm it outputs `PE32+ executable (console) x86-64 for MS Windows`.)

4. Confirm both binaries are compiled and ready:
   ls -lh bin/
   (Verification: Both files are listed with valid sizes, typically between 15MB and 35MB.)

---

### Step 4: Publishing an Official Release on GitHub
Distribute compiled binaries so users can download ready-to-run packages without compiling Go source code.

1. Open your repository on GitHub:
   https://github.com/elric-seaoffate/svg-animator

2. On the right-hand panel, click "Releases", then click "Draft a new release" (or "Create a new release").

3. Configure release details:
   - Tag version: Click "Choose a tag", type a semantic version (e.g., v1.1.0), and select "Create new tag on publish".
   - Target: Leave set to `main`.
   - Release title: Enter a versioned title (e.g., `SVG Animator Studio v1.1.0`).
   - Description: Copy and paste the contents of your `RELEASE_NOTES.md`.

4. Attach the binary executables:
   - Drag and drop `bin/svg-animator-linux` into the attachment box.
   - Drag and drop `bin/svg-animator-windows.exe` into the attachment box.

5. Click "Publish release".
   (Verification: The release page displays download cards for both executable files and renders the release notes.)

---

### Step 5: Remove Accidentally Committed Files (Standard Clean)
Use this if temporary or workspace files were tracked by mistake (even if listed in `.gitignore`), preserving local files while removing them from remote repositories.

1. Untrack the target files from Git index without deleting local files on disk:
   git rm --cached filename1.txt filename2.txt
   (Verification: Run `git status` — files appear as staged deletions under "Changes to be committed".)

2. Commit the untracked state:
   git commit -m "Untrack unwanted files and enforce gitignore"

3. Push the clean state to both remotes:
   git push origin main
   git push github main
   (Verification: Refresh GitHub/Gitea; the files are removed from the remote tree while remaining on disk.)

---

### Step 6: Permanently Purge Files from All Git History
If unwanted files were already committed in earlier revisions and must be erased completely from all previous commit logs:

1. Strip the target files across every commit in the repository:
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch filename1.txt filename2.txt" \
     --prune-empty --tag-name-filter cat -- --all
   (Verification: Terminal output shows rewrite passes completing without errors.)

2. Overwrite both remote repositories with the rewritten history:
   git push github main --force
   git push origin main --force
   (Verification: Terminal logs indicate `(forced update)` with updated commit hashes on both remotes.)

3. Confirm files are purged from the commit logs:
   git log --full-history -- "filename1.txt"
   (Verification: The command returns empty output, confirming zero references remain in Git history.)