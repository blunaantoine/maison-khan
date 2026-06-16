#!/bin/bash
# Launch script for maison-khan dev server (detached, survives shell exit)
# Launched via cron tool so it runs outside the bash-tool cgroup.

cd /home/z/my-project

# Kill any existing next dev server
pkill -f "next dev" 2>/dev/null
sleep 1

# Clear log
> /home/z/my-project/dev.log

# Launch next dev server fully detached in its own session
setsid /home/z/my-project/node_modules/.bin/next dev -p 3000 > /home/z/my-project/dev.log 2>&1 < /dev/null &

# Save the PID
echo $! > /home/z/my-project/.zscripts/dev.pid

# Wait for it to be ready
for i in $(seq 1 30); do
  if curl -s --max-time 2 http://127.0.0.1:3000/ > /dev/null 2>&1; then
    echo "READY after ${i}s"
    exit 0
  fi
  sleep 1
done

echo "TIMEOUT"
exit 1
