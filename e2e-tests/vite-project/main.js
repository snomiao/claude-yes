// Simple Vite project for testing claude-yes
const statusEl = document.getElementById('status');

// Log that the app has loaded
console.log('Vite app loaded successfully');

// Set status to indicate the app is running
statusEl.textContent = 'Vite dev server is running!';
statusEl.style.color = 'green';

// Add some interactive functionality for testing
const button = document.createElement('button');
button.textContent = 'Test Claude-Yes';
button.onclick = () => {
  statusEl.textContent = 'Claude-Yes test button clicked!';
  console.log('Test button clicked');
};

document.getElementById('app').appendChild(button);
