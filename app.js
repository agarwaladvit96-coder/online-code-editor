/*
   WASM IDE Orchestration Script
   Manages Monaco Editor, Web Worker life cycle, and dynamic UI theme transitions
*/

// Global diagnostic error logging
window.addEventListener('error', (event) => {
  const msg = `[Global Error] ${event.message || 'Error'} at ${event.filename || 'unknown'}:${event.lineno || 0}`;
  console.error(msg, event);
  const term = document.getElementById('terminal-stdout');
  if (term) {
    const line = document.createElement('div');
    line.className = 'terminal-line stderr';
    line.textContent = msg;
    term.appendChild(line);
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const msg = `[Unhandled Promise Rejection] ${event.reason}`;
  console.error(msg, event);
  const term = document.getElementById('terminal-stdout');
  if (term) {
    const line = document.createElement('div');
    line.className = 'terminal-line stderr';
    line.textContent = msg;
    term.appendChild(line);
  }
});

// Default code templates per language
const CODE_TEMPLATES = {
  python: `# Python WASM Sandbox (Pyodide)
import sys
import math

print("Hello from Python in WebAssembly!")
print("Python version:", sys.version)

# Mathematical operation
numbers = [1, 2, 3, 4, 5]
squares = [int(math.pow(x, 2)) for x in numbers]
print(f"Squares of {numbers} are {squares}")
`,
  javascript: `// JavaScript Sandboxed Runner
console.log("Hello from JavaScript Web Worker!");

// Performance benchmark
const start = performance.now();
let count = 0;
for (let i = 0; i < 1000000; i++) {
  count += i;
}
const end = performance.now();

console.log("Calculated sum 1 to 1,000,000:", count);
console.log(\`Execution time: \${(end - start).toFixed(2)}ms\`);
`,
  ruby: `# Ruby WASM Sandbox (ruby.wasm)
puts "Hello from Ruby in WebAssembly!"
puts "Ruby Version: #{RUBY_VERSION}"

# Array manipulation
fruits = ["apple", "banana", "cherry"]
fruits.map! { |f| f.capitalize }

puts "Capitalized fruits: #{fruits.join(', ')}"
`,
  lua: `-- Lua WASM Sandbox (Wasmoon)
print("Hello from Lua in WebAssembly!")
print("Lua version: " .. _VERSION)

-- Table operations
local stats = {HP = 100, MP = 50, Level = 15}
print("Player Attributes:")
for key, val in pairs(stats) do
    print(" - " .. key .. ": " .. val)
end
`,
  c: `// C WASM Interpreter (picocjs)
#include <stdio.h>

int main() {
    printf("Hello from C in WebAssembly!\\n");
    
    int sum = 0;
    for (int i = 1; i <= 10; i++) {
        sum += i;
    }
    
    printf("The sum of numbers from 1 to 10 is: %d\\n", sum);
    return 0;
}
`,
  cpp: `// C++ WASM Sandbox (picocjs)
#include <stdio.h>

// Note: picoc runs standard C++ C-subset
int main() {
    printf("Hello from C++ in WebAssembly!\\n");
    
    int sum = 0;
    for (int i = 1; i <= 20; i++) {
        sum += i;
    }
    
    printf("The sum of numbers from 1 to 20 is: %d\\n", sum);
    return 0;
}
`,
  php: `<?php
// PHP WASM Sandbox (php-wasm)
echo "Hello from PHP in WebAssembly!\\n";
echo "PHP version: " . phpversion() . "\\n";

$numbers = [1, 2, 3, 4, 5];
$doubles = array_map(function($x) { return $x * 2; }, $numbers);

echo "Doubled values: " . implode(", ", $doubles) . "\\n";
?>`,
  sqlite: `-- SQLite SQL Sandbox (sql.js)
-- 1. Create a new table
CREATE TABLE courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT,
    difficulty TEXT
);

-- 2. Insert test records
INSERT INTO courses (title, category, difficulty) VALUES
('WASM Development', 'WebAssembly', 'Advanced'),
('Modern Python', 'Python', 'Beginner'),
('Relational Databases', 'SQL', 'Intermediate'),
('Embedded C Programming', 'C/C++', 'Advanced');

-- 3. Run queries
SELECT * FROM courses;
SELECT category, COUNT(*) as count FROM courses GROUP BY category;
`,
  java: `// Java WASM Sandbox (TeaVM)
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello from Java in WebAssembly!");
        System.out.println("Java compiler: TeaVM Ahead-of-Time");
        
        int sum = 0;
        for (int i = 1; i <= 10; i++) {
            sum += i;
        }
        System.out.println("The sum of numbers from 1 to 10 is: " + sum);
    }
}
`,
  html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>HTML Preview</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #1e1e2e;
            color: #cdd6f4;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 90vh;
            margin: 0;
        }
        h1 {
            color: #89b4fa;
            margin-bottom: 10px;
        }
        p {
            color: #a6adc8;
        }
        .btn {
            background: #89b4fa;
            color: #11111b;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
            margin-top: 15px;
            transition: background 0.2s;
        }
        .btn:hover {
            background: #b4befe;
        }
    </style>
</head>
<body>
    <h1>Hello from HTML5!</h1>
    <p>This is a live, sandboxed browser preview of your HTML code.</p>
    <button class="btn" onclick="alert('JavaScript works inside preview!')">Click Me</button>
</body>
</html>
`
};

// Extension mapping
const LANG_METADATA = {
  python: { label: 'Python', ext: 'py', mode: 'python', color: '#10b981', rgb: '16, 185, 129' },
  javascript: { label: 'JavaScript', ext: 'js', mode: 'javascript', color: '#f59e0b', rgb: '245, 158, 11' },
  ruby: { label: 'Ruby', ext: 'rb', mode: 'ruby', color: '#f43f5e', rgb: '244, 63, 94' },
  lua: { label: 'Lua', ext: 'lua', mode: 'lua', color: '#0ea5e9', rgb: '14, 165, 233' },
  c: { label: 'C', ext: 'c', mode: 'cpp', color: '#14b8a6', rgb: '20, 184, 166' },
  cpp: { label: 'C++', ext: 'cpp', mode: 'cpp', color: '#00599c', rgb: '0, 89, 156' },
  php: { label: 'PHP', ext: 'php', mode: 'php', color: '#f97316', rgb: '249, 115, 22' },
  sqlite: { label: 'SQLite', ext: 'sql', mode: 'sql', color: '#a855f7', rgb: '168, 85, 247' },
  java: { label: 'Java', ext: 'java', mode: 'java', color: '#f89820', rgb: '248, 152, 32' },
  html: { label: 'HTML5', ext: 'html', mode: 'html', color: '#f06529', rgb: '240, 101, 41' }
};

// Application State
let activeLang = 'python';
let editor = null;
let worker = null;
let currentCode = {}; // Store custom code per language in-session
let isRunning = false;
let bootStartTime = null;
let runStartTime = null;


// PHP JVM State and Runner (Main Thread)
let isPhpReady = false;
let phpInstance = null;

async function initPhpRuntime() {
  if (isPhpReady) return;
  updateStatus('loading', 'Loading PHP Runtime...');
  appendLog('system-msg', 'Downloading php-wasm engine...');
  const { PhpWeb } = await import('https://cdn.jsdelivr.net/npm/php-wasm/PhpWeb.mjs');
  phpInstance = new PhpWeb();
  isPhpReady = true;
  updateStatus('ready', 'PHP Ready');
  appendLog('success-msg', 'PHP engine initialized successfully.');
}

async function runPhpCode() {
  try {
    await initPhpRuntime();
  } catch (err) {
    appendLog('stderr', `Failed to load PHP: ${err.message}\n`);
    updateStatus('ready', 'PHP Load Failed');
    isRunning = false;
    btnRun.disabled = false;
    btnStop.disabled = true;
    return;
  }

  isRunning = true;
  btnRun.disabled = true;
  btnStop.disabled = false;
  
  updateStatus('running', 'Running PHP Program...');
  appendLog('system-msg', '\n--- Executing PHP Sandbox ---');
  
  runStartTime = performance.now();
  const code = editor.getValue();
  
  const outputHandler = (event) => {
    appendLog('stdout', event.detail);
  };
  
  phpInstance.addEventListener('output', outputHandler);

  try {
    await phpInstance.run(code);
    onPhpDone(false);
  } catch (err) {
    appendLog('stderr', `PHP Runtime Error: ${err.message || err.toString()}\n`);
    onPhpDone(true);
  } finally {
    phpInstance.removeEventListener('output', outputHandler);
  }
}

function onPhpDone(isError) {
  const execTime = ((performance.now() - runStartTime) / 1000).toFixed(2);
  metricExecTime.textContent = `${execTime}s`;
  
  isRunning = false;
  btnRun.disabled = false;
  btnStop.disabled = true;
  
  if (isError) {
    updateStatus('ready', 'PHP Completed with Error');
    appendLog('error-msg', 'Process finished with errors.');
  } else {
    updateStatus('ready', 'PHP Completed');
    appendLog('success-msg', 'Process finished successfully.');
  }
}

// DOM Elements
const btnRun = document.getElementById('btn-run');
const btnStop = document.getElementById('btn-stop');
const btnClear = document.getElementById('btn-clear');
const btnReset = document.getElementById('btn-reset');
const btnShare = document.getElementById('btn-share');
const btnDownload = document.getElementById('btn-download');

const runtimeStatus = document.getElementById('runtime-status');
const terminalStdout = document.getElementById('terminal-stdout');
const currentFilename = document.getElementById('current-filename');
const runMetrics = document.getElementById('run-metrics');
const metricExecTime = document.getElementById('metric-exec-time');
const metricBootTime = document.getElementById('metric-boot-time');
const fontSizeSelect = document.getElementById('font-size-select');

// Tab toggles
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const tabDatabaseBtn = document.getElementById('tab-database-btn');
const tabPreviewBtn = document.getElementById('tab-preview-btn');
const tabPreviewFrame = document.getElementById('html-preview-frame');

// SQL Database Viewer Elements
const dbTablesList = document.getElementById('db-tables-list');
const dbResultsWrapper = document.getElementById('db-results-wrapper');

// Modal Elements
const shareModal = document.getElementById('share-modal');
const shareUrlInput = document.getElementById('share-url');
const shareModalClose = document.getElementById('share-modal-close');
const btnCopyUrl = document.getElementById('btn-copy-url');
const copySuccessMsg = document.getElementById('copy-success-msg');

// Initialize Monaco Editor
function initMonaco() {
  monaco_loader.init().then(monaco => {
    // Configure default editor options
    const editorOptions = {
      value: CODE_TEMPLATES.python,
      language: 'python',
      theme: 'vs-dark',
      automaticLayout: true,
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Fira Code, monospace',
      minimap: { enabled: false },
      lineNumbers: 'on',
      roundedSelection: true,
      scrollBeyondLastLine: false,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      padding: { top: 12, bottom: 12 },
      bracketPairColorization: { enabled: true }
    };
    
    editor = monaco.editor.create(document.getElementById('editor-container'), editorOptions);
    
    // Save contents on change
    editor.onDidChangeModelContent(() => {
      currentCode[activeLang] = editor.getValue();
    });

    // Check URL state for loaded shared link
    loadSharedState();

    // Set UI to ready
    updateStatus('ready', 'WASM Runtimes Ready');
    btnRun.disabled = false;
  }).catch(err => {
    updateStatus('idle', 'Monaco load failed.');
    appendLog('stderr', `Error loading Monaco Editor: ${err.message}`);
  });
}

// Update runtime status bar UI
function updateStatus(state, text) {
  const indicator = runtimeStatus.querySelector('.status-indicator');
  const statusText = runtimeStatus.querySelector('.status-text');
  
  indicator.className = `status-indicator ${state}`;
  statusText.textContent = text;
}

// Log streaming helper
function appendLog(stream, text) {
  const line = document.createElement('div');
  line.className = `terminal-line ${stream}`;
  line.textContent = text;
  terminalStdout.appendChild(line);
  terminalStdout.scrollTop = terminalStdout.scrollHeight;
}

function clearConsole() {
  terminalStdout.innerHTML = '';
}

// Switch languages and apply styling variable values
function selectLanguage(lang) {
  if (lang === activeLang) return;
  activeLang = lang;
  
  // Set active style variable variables on document root
  const metadata = LANG_METADATA[lang];
  document.documentElement.style.setProperty('--accent-color', metadata.color);
  document.documentElement.style.setProperty('--accent-color-rgb', metadata.rgb);

  // Update sidebar selection
  document.querySelectorAll('.lang-card').forEach(card => {
    if (card.dataset.lang === lang) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });

  // Switch Monaco Editor language state
  if (editor) {
    const code = currentCode[lang] || CODE_TEMPLATES[lang];
    const model = editor.getModel();
    
    // Update language mode
    monaco.editor.setModelLanguage(model, metadata.mode);
    editor.setValue(code);
    currentFilename.textContent = `main.${metadata.ext}`;
  }

  // Handle SQLite explorer and HTML preview tabs visibility
  const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'terminal';
  if (lang === 'sqlite') {
    tabDatabaseBtn.style.display = 'flex';
    tabPreviewBtn.style.display = 'none';
    if (activeTab === 'preview') switchTab('terminal');
  } else if (lang === 'html') {
    tabDatabaseBtn.style.display = 'none';
    tabPreviewBtn.style.display = 'flex';
    if (activeTab === 'database') switchTab('terminal');
  } else {
    tabDatabaseBtn.style.display = 'none';
    tabPreviewBtn.style.display = 'none';
    if (activeTab === 'database' || activeTab === 'preview') {
      switchTab('terminal'); // Default back to terminal
    }
  }
}

// Tabs switcher
function switchTab(tabName) {
  tabBtns.forEach(btn => {
    if (btn.dataset.tab === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  tabContents.forEach(content => {
    if (content.id === `tab-${tabName}`) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });
}

// Initialize Web Worker instance
function initWorker() {
  if (worker) {
    worker.terminate();
  }
  
  // Spawns Web Worker as classic worker to avoid CORS blocks on cross-origin imports (uses cache busting)
  worker = new Worker('worker.js?t=' + Date.now());
  
  worker.onmessage = (event) => {
    const data = event.data;
    
    if (data.type === 'status') {
      updateStatus('loading', data.text);
      appendLog('system-msg', data.text);
    } 
    else if (data.type === 'output') {
      appendLog(data.stream, data.text);
    } 
    else if (data.type === 'done') {
      const execTime = ((performance.now() - runStartTime) / 1000).toFixed(2);
      metricExecTime.textContent = `${execTime}s`;
      
      if (bootStartTime) {
        const bootTime = ((performance.now() - bootStartTime) / 1000).toFixed(2);
        metricBootTime.textContent = `${bootTime}s`;
        bootStartTime = null; // Clear boot mark
      }
      
      isRunning = false;
      btnRun.disabled = false;
      btnStop.disabled = true;
      
      if (data.error) {
        updateStatus('ready', 'Execution Completed with Error');
        appendLog('error-msg', `Process finished with errors.`);
      } else {
        updateStatus('ready', 'Execution Completed');
        appendLog('success-msg', `Process finished successfully.`);
      }
      
      // Update Database Explorer tables if SQLite returned database state
      if (activeLang === 'sqlite' && data.dbState) {
        updateDatabaseExplorer(data.dbState);
      }
    }
  };

  worker.onerror = (err) => {
    console.error("Worker compile/load error details:", err);
    let errMsg = `Web Worker Error: ${err.message || 'Generic script compilation, fetch, or CORS safety error'}`;
    if (err.filename) {
      errMsg += ` at ${err.filename}:${err.lineno}`;
    }
    appendLog('stderr', errMsg + '\n');
    stopExecution();
  };
}

// Run current code inside worker
function runCode() {
  if (isRunning) return;
  
  if (activeLang === 'html') {
    runHtmlCode();
    return;
  }
  
  if (activeLang === 'php') {
    runPhpCode();
    return;
  }
  
  if (!worker) {
    initWorker();
  }
  
  isRunning = true;
  btnRun.disabled = true;
  btnStop.disabled = false;
  
  updateStatus('running', `Running ${LANG_METADATA[activeLang].label}...`);
  appendLog('system-msg', `\n--- Executing ${LANG_METADATA[activeLang].label} Sandbox ---`);
  
  runStartTime = performance.now();
  
  // Record boot time if first run of the session
  if (metricBootTime.textContent === '-') {
    bootStartTime = performance.now();
  }
  
  const code = editor.getValue();
  worker.postMessage({
    action: 'run',
    language: activeLang,
    code: code
  });
}

// HTML Renderer (Direct Browser Preview Frame)
function runHtmlCode() {
  isRunning = true;
  btnRun.disabled = true;
  btnStop.disabled = false;
  
  updateStatus('running', 'Rendering HTML Preview...');
  appendLog('system-msg', '\n--- Rendering HTML Sandbox ---');
  
  runStartTime = performance.now();
  const code = editor.getValue();
  
  try {
    tabPreviewFrame.srcdoc = code;
    switchTab('preview');
    appendLog('success-msg', 'HTML page rendered successfully in Preview tab.');
    onHtmlDone(false);
  } catch (err) {
    appendLog('stderr', `HTML Preview Error: ${err.message || err.toString()}\n`);
    onHtmlDone(true);
  }
}

function onHtmlDone(isError) {
  const execTime = ((performance.now() - runStartTime) / 1000).toFixed(2);
  metricExecTime.textContent = `${execTime}s`;
  
  isRunning = false;
  btnRun.disabled = false;
  btnStop.disabled = true;
  
  if (isError) {
    updateStatus('ready', 'HTML Preview Failed');
    appendLog('error-msg', 'Process finished with errors.');
  } else {
    updateStatus('ready', 'HTML Preview Ready');
    appendLog('success-msg', 'Process finished successfully.');
  }
}

// Stop execution of worker (by terminating and re-spawning a clean one)
function stopExecution() {
  if (!isRunning) return;
  
  if (activeLang === 'java') {
    appendLog('stderr', '\n[Note: Main-thread JVM loops cannot be interrupted safely from JavaScript. Please refresh the page if your program is stuck in an infinite loop.]\n');
    isRunning = false;
    btnRun.disabled = false;
    btnStop.disabled = true;
    updateStatus('ready', 'Execution Stopped');
    return;
  }
  
  if (activeLang === 'php') {
    isRunning = false;
    btnRun.disabled = false;
    btnStop.disabled = true;
    updateStatus('ready', 'Execution Stopped');
    return;
  }
  
  if (worker) {
    worker.terminate();
    worker = null;
  }
  
  isRunning = false;
  btnRun.disabled = false;
  btnStop.disabled = true;
  
  updateStatus('ready', 'Execution Interrupted');
  appendLog('stderr', '\n[Execution Interrupted by User]\n');
  
  // Spawn a clean worker for future runs
  initWorker();
}

// Update SQLite explorer panel tables & grids
function updateDatabaseExplorer(dbState) {
  // Clear lists
  dbTablesList.innerHTML = '';
  
  if (!dbState.tables || dbState.tables.length === 0) {
    dbTablesList.innerHTML = `<li class="empty-msg">No tables found.</li>`;
    dbResultsWrapper.innerHTML = `<div class="empty-msg">No tables created yet.</div>`;
    return;
  }

  // Populate tables list
  dbState.tables.forEach(table => {
    const li = document.createElement('li');
    li.innerHTML = `<span><i class="fa-solid fa-table"></i> ${table.name}</span> <span class="row-count">${table.count} rows</span>`;
    dbTablesList.appendChild(li);
  });

  // Populate active results table
  if (dbState.lastResults) {
    const res = dbState.lastResults;
    let tableHtml = `<table class="premium-table"><thead><tr>`;
    
    // Table Headers
    res.columns.forEach(col => {
      tableHtml += `<th>${col}</th>`;
    });
    tableHtml += `</tr></thead><tbody>`;
    
    // Table Rows
    res.values.forEach(row => {
      tableHtml += `<tr>`;
      row.forEach(val => {
        tableHtml += `<td>${val === null ? '<em>NULL</em>' : val}</td>`;
      });
      tableHtml += `</tr>`;
    });
    
    tableHtml += `</tbody></table>`;
    dbResultsWrapper.innerHTML = tableHtml;
  } else {
    dbResultsWrapper.innerHTML = `<div class="empty-msg">Query executed successfully. No rows returned.</div>`;
  }
}

// Reset template
function resetTemplate() {
  if (editor) {
    editor.setValue(CODE_TEMPLATES[activeLang]);
    currentCode[activeLang] = CODE_TEMPLATES[activeLang];
    appendLog('system-msg', `Reset ${LANG_METADATA[activeLang].label} template to default.`);
  }
}

// Share Code Modal triggers
function generateShareLink() {
  if (!editor) return;
  
  const code = editor.getValue();
  const state = {
    l: activeLang,
    c: code
  };
  
  // Base64 encode JSON state
  const serialized = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
  const url = `${window.location.origin}${window.location.pathname}#state=${serialized}`;
  
  shareUrlInput.value = url;
  shareModal.classList.add('active');
  copySuccessMsg.classList.remove('visible');
}

function loadSharedState() {
  const hash = window.location.hash;
  if (hash.startsWith('#state=')) {
    try {
      const base64 = hash.replace('#state=', '');
      const json = decodeURIComponent(escape(atob(base64)));
      const state = JSON.parse(json);
      
      if (state.l && state.c) {
        // Load language and code
        currentCode[state.l] = state.c;
        selectLanguage(state.l);
        editor.setValue(state.c);
        appendLog('system-msg', `Loaded shared code for ${LANG_METADATA[state.l].label}.`);
      }
    } catch (err) {
      appendLog('stderr', `Failed to load shared URL state: ${err.message}`);
    }
  }
}

// Download code file
function downloadFile() {
  if (!editor) return;
  
  const code = editor.getValue();
  const meta = LANG_METADATA[activeLang];
  const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `main.${meta.ext}`;
  link.click();
  URL.revokeObjectURL(link.href);
}

// Set up event listeners
function setupEvents() {
  // Run & Stop controls
  btnRun.addEventListener('click', runCode);
  btnStop.addEventListener('click', stopExecution);
  btnClear.addEventListener('click', clearConsole);
  btnReset.addEventListener('click', resetTemplate);
  btnShare.addEventListener('click', generateShareLink);
  btnDownload.addEventListener('click', downloadFile);

  // Keyboard shortcut Ctrl+Enter to run code
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runCode();
    }
  });

  // Language selectors
  document.querySelectorAll('.lang-card').forEach(card => {
    card.addEventListener('click', () => {
      selectLanguage(card.dataset.lang);
    });
  });

  // Tab selections
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });

  // Font size change
  fontSizeSelect.addEventListener('change', (e) => {
    if (editor) {
      editor.updateOptions({ fontSize: parseInt(e.target.value) });
    }
  });

  // Modal interactions
  shareModalClose.addEventListener('click', () => {
    shareModal.classList.remove('active');
  });

  btnCopyUrl.addEventListener('click', () => {
    shareUrlInput.select();
    document.execCommand('copy');
    copySuccessMsg.classList.add('visible');
  });

  // Close modal when clicking outside
  shareModal.addEventListener('click', (e) => {
    if (e.target === shareModal) {
      shareModal.classList.remove('active');
    }
  });
}

// Initialize Application
setupEvents();
initWorker();
initMonaco();
