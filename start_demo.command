#!/bin/sh
# 双击启动：读取 .env 里的模型设置，启动原型并打开浏览器。关闭此窗口即停止。
cd "$(dirname "$0")"
if [ -f .env ] && grep -q '^MODEL_PROVIDER=openai' .env; then
  echo "使用 .env 中配置的远程模型（材料会发送到该服务）。"
elif ! curl -s -m 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  echo "没有 .env 远程模型配置，也没有检测到 Ollama。"
  echo "复制 .env.example 为 .env 并填入 DeepSeek key，或先打开 Ollama，再双击本文件。"
  echo "只看界面可在终端运行：MODEL_PROVIDER=mock ./run.sh"
  read -r _
  exit 1
fi
(sleep 2; open "http://127.0.0.1:${APP_PORT:-8765}/") &
exec python3 server.py
