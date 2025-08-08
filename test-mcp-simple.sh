#!/bin/bash

echo "Starting REPL test..."

# Create a named pipe
mkfifo /tmp/repl_pipe

# Start the REPL in the background
node dist/cli.js < /tmp/repl_pipe &
REPL_PID=$!

# Give it time to initialize
sleep 3

# Send commands to the pipe
echo "Sending /mcptools command..."
echo "/mcptools" > /tmp/repl_pipe
sleep 2

echo "Sending test message..."
echo "list files" > /tmp/repl_pipe
sleep 5

echo "Sending exit command..."
echo "/exit" > /tmp/repl_pipe

# Wait for REPL to finish
wait $REPL_PID

# Clean up
rm /tmp/repl_pipe

echo "Test completed"