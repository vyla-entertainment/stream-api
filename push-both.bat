@echo off

echo Setting up remotes...

git remote remove github 2>nul
git remote add github https://github.com/vyla-entertainment/stream-api.git

git remote remove hf 2>nul
git remote add hf https://huggingface.co/spaces/MissouriMonster/vyla

git remote remove hf2 2>nul
git remote add hf2 https://huggingface.co/spaces/MissouriMonster/stopusingthislink4urproject

git remote remove hf3 2>nul
git remote add hf3 https://huggingface.co/spaces/MissouriMonster/momo

git remote remove hf4 2>nul
git remote add hf4 https://huggingface.co/spaces/MissouriMonster/popr

echo Pushing to Hugging Face...
git push hf main --force
git push hf2 main --force
git push hf3 main --force
git push hf4 main --force

echo Pushing to GitHub...
git push github main --force

echo Done!