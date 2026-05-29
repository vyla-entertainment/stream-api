@echo off
echo Setting up remotes...

call :add github https://github.com/vyla-entertainment/stream-api.git
call :add hf https://huggingface.co/spaces/MissouriMonster/vyla
call :add hf2 https://huggingface.co/spaces/MissouriMonster/stopusingthislink4urproject
call :add hf3 https://huggingface.co/spaces/MissouriMonster/momo
call :add hf4 https://huggingface.co/spaces/MissouriMonster/popr
call :add hf5 https://huggingface.co/spaces/MissouriMonster/peaktv
call :add hf6 https://huggingface.co/spaces/MissouriMonster/movieslay

echo Pushing...
for %%R in (github hf hf2 hf3 hf4 hf5 hf6) do git push %%R main --force

echo Done!
exit /b

:add
git remote remove %1 2>nul
git remote add %1 %2
exit /b