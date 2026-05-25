@echo off

echo Setting up remotes...

git remote remove github 2>nul
git remote add github https://github.com/vyla-entertainment/stream-api.git

git remote remove hf 2>nul
git remote add hf https://huggingface.co/spaces/MissouriMonster/vyla

git remote remove hf2 2>nul
git remote add hf2 https://huggingface.co/spaces/MissouriMonster/plsdontusethisinurprojectusetheotherone

echo Pushing to GitHub...
git push github main --force

echo Pushing to Hugging Face...
git push hf main --force
git push hf2 main --force

echo Done!