/*
   WASM IDE Classic Web Worker
   Runs as a classic worker to completely avoid Same-Origin / CORS blocks on cross-origin module imports.
   Loads runtimes dynamically via UMD and importScripts() only when executed.
*/

// Cached instances
let pyodideInstance = null;
let rubyVMInstance = null;
let luaEngineInstance = null;
let sqlInstance = null;
let sqlDbInstance = null;

// Real-time status reporting
function reportStatus(text) {
  self.postMessage({ type: 'status', text });
}

// Global console redirector for UMD scripts that cache console references at script load time
let activeLanguagePrinter = null;
const originalLog = console.log;
const originalWarn = console.warn;

console.log = (...args) => {
  if (activeLanguagePrinter) {
    self.postMessage({ type: 'output', stream: 'stdout', text: args.join(' ') + '\n' });
  }
  originalLog.apply(console, args);
};

console.warn = (...args) => {
  if (activeLanguagePrinter) {
    self.postMessage({ type: 'output', stream: 'stderr', text: args.join(' ') + '\n' });
  }
  originalWarn.apply(console, args);
};

// 1. Python Runner (Pyodide UMD)
async function runPython(code) {
  if (!pyodideInstance) {
    importScripts("wasm/pyodide.js");
    
    reportStatus('Initializing Python WASM environment (Pyodide)...');
    pyodideInstance = await self.loadPyodide({
      indexURL: "wasm/"
    });
    
    // Stream stdout/stderr in real-time
    pyodideInstance.setStdout({
      batched: (text) => self.postMessage({ type: 'output', stream: 'stdout', text: text + '\n' })
    });
    pyodideInstance.setStderr({
      batched: (text) => self.postMessage({ type: 'output', stream: 'stderr', text: text + '\n' })
    });
  }
  
  reportStatus('Executing Python script...');
  try {
    await pyodideInstance.runPythonAsync(code);
    self.postMessage({ type: 'done' });
  } catch (err) {
    self.postMessage({ type: 'output', stream: 'stderr', text: err.message + '\n' });
    self.postMessage({ type: 'done', error: true });
  }
}

// 2. Ruby Runner (ruby.wasm UMD)
async function runRuby(code) {
  if (!rubyVMInstance) {
    importScripts("wasm/ruby.umd.js");
    
    reportStatus('Fetching Ruby WASM binary...');
    const response = await fetch("wasm/ruby.wasm");
    const buffer = await response.arrayBuffer();
    
    reportStatus('Initializing Ruby VM...');
    const module = await WebAssembly.compile(buffer);
    const { DefaultRubyVM } = self["ruby-wasm-wasi"];
    const { vm } = await DefaultRubyVM(module);
    rubyVMInstance = vm;
  }

  activeLanguagePrinter = 'ruby';
  try {
    rubyVMInstance.eval(code);
    self.postMessage({ type: 'done' });
  } catch (err) {
    self.postMessage({ type: 'output', stream: 'stderr', text: err.toString() + '\n' });
    self.postMessage({ type: 'done', error: true });
  } finally {
    activeLanguagePrinter = null;
  }
}

// 3. Lua Runner (Wasmoon UMD)
async function runLua(code) {
  if (!luaEngineInstance) {
    importScripts("wasm/wasmoon.js");
    
    reportStatus('Initializing Lua 5.4 VM in WASM (Wasmoon)...');
    const { LuaFactory } = self.wasmoon;
    const factory = new LuaFactory("wasm/glue.wasm");
    luaEngineInstance = await factory.createEngine();
  }

  luaEngineInstance.global.set('print', (...args) => {
    const text = args.map(a => a === null ? 'nil' : a.toString()).join('\t');
    self.postMessage({ type: 'output', stream: 'stdout', text: text + '\n' });
  });

  reportStatus('Executing Lua code...');
  try {
    await luaEngineInstance.doString(code);
    self.postMessage({ type: 'done' });
  } catch (err) {
    self.postMessage({ type: 'output', stream: 'stderr', text: err.toString() + '\n' });
    self.postMessage({ type: 'done', error: true });
  }
}

// 4. SQLite SQL Runner (sql.js UMD)
async function runSql(code) {
  if (!sqlInstance) {
    reportStatus('Loading SQLite WASM script...');
    importScripts("wasm/sql-wasm.js");
    
    reportStatus('Initializing SQLite database engine...');
    sqlInstance = await self.initSqlJs({
      locateFile: file => `wasm/${file}`
    });
    sqlDbInstance = new sqlInstance.Database();
  }

  reportStatus('Executing SQL statements...');
  try {
    const results = sqlDbInstance.exec(code);
    
    const tablesResult = sqlDbInstance.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
    const tables = [];
    if (tablesResult.length > 0) {
      const names = tablesResult[0].values.map(row => row[0]);
      for (const name of names) {
        const countRes = sqlDbInstance.exec(`SELECT COUNT(*) FROM ${name};`);
        const count = countRes.length > 0 ? countRes[0].values[0][0] : 0;
        tables.push({ name, count });
      }
    }

    self.postMessage({ type: 'output', stream: 'stdout', text: `SQL script executed successfully. Returned ${results.length} result set(s).\n` });
    
    results.forEach((res, idx) => {
      self.postMessage({ type: 'output', stream: 'stdout', text: `\n[Result Set #${idx + 1}]\n` });
      
      const cols = res.columns.join(' | ');
      const sep = res.columns.map(c => '-'.repeat(Math.max(c.length, 3))).join('-+-');
      self.postMessage({ type: 'output', stream: 'stdout', text: `${cols}\n${sep}\n` });
      
      res.values.forEach(row => {
        const valStr = row.map(v => v === null ? 'NULL' : v.toString()).join(' | ');
        self.postMessage({ type: 'output', stream: 'stdout', text: `${valStr}\n` });
      });
      self.postMessage({ type: 'output', stream: 'stdout', text: `Total rows: ${res.values.length}\n` });
    });

    self.postMessage({ 
      type: 'done', 
      dbState: { 
        tables: tables, 
        lastResults: results.length > 0 ? results[results.length - 1] : null 
      } 
    });
  } catch (err) {
    self.postMessage({ type: 'output', stream: 'stderr', text: err.message + '\n' });
    self.postMessage({ type: 'done', error: true });
  }
}

// 5. C & C++ Runner (picocjs UMD)
async function runC(code) {
  reportStatus('Loading picocjs compiler script...');
  try {
    importScripts("wasm/picoc.js");
    
    const pjs = self.picocjs;
    if (!pjs || !pjs.runC) {
      throw new Error("picocjs C compilation engine could not be instantiated.");
    }
    
    reportStatus('Compiling and Running C/C++ Code...');
    pjs.runC(code, (output) => {
      self.postMessage({ type: 'output', stream: 'stdout', text: output });
    });
    
    self.postMessage({ type: 'done' });
  } catch (err) {
    self.postMessage({ type: 'output', stream: 'stderr', text: err.message + '\n' });
    self.postMessage({ type: 'done', error: true });
  }
}

// 6. JavaScript Runner (Sandboxed Local Worker Execution)
async function runJs(code) {
  reportStatus('Executing JavaScript...');
  
  const originalLog = console.log;
  const originalError = console.error;
  
  console.log = (...args) => {
    const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
    self.postMessage({ type: 'output', stream: 'stdout', text: text + '\n' });
  };
  
  console.error = (...args) => {
    const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
    self.postMessage({ type: 'output', stream: 'stderr', text: text + '\n' });
  };

  try {
    const evalFn = new Function(`return (async () => { ${code} })()`);
    await evalFn();
    self.postMessage({ type: 'done' });
  } catch (err) {
    self.postMessage({ type: 'output', stream: 'stderr', text: err.toString() + '\n' });
    self.postMessage({ type: 'done', error: true });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

// 7. Java Runner (TeaVM WASM compiler & executor)
let teavmCompiler = null;

async function runJava(code) {
  if (!teavmCompiler) {
    reportStatus('Loading TeaVM compiler JS runtime...');
    importScripts("wasm/compiler.wasm-runtime.js");
    
    reportStatus('Loading TeaVM compiler WASM...');
    const compilerInstance = await self.loadTeaVM("wasm/compiler.wasm");
    const compilerLib = compilerInstance.exports;
    teavmCompiler = compilerLib.createCompiler();
    
    reportStatus('Loading Java standard library (SDK)...');
    const sdkRes = await fetch("wasm/compile-classlib-teavm.bin");
    teavmCompiler.setSdk(new Int8Array(await sdkRes.arrayBuffer()));
    
    reportStatus('Loading TeaVM runtime classlib...');
    const classlibRes = await fetch("wasm/runtime-classlib-teavm.bin");
    teavmCompiler.setTeaVMClasslib(new Int8Array(await classlibRes.arrayBuffer()));
    
    teavmCompiler.onDiagnostic((diagnostic) => {
      const severity = diagnostic.severity;
      const type = severity === 'error' ? 'stderr' : 'stdout';
      const prefix = severity === 'error' ? 'Error' : 'Warning';
      self.postMessage({
        type: 'output',
        stream: type,
        text: `${prefix} in ${diagnostic.fileName} (at line ${diagnostic.lineNumber}):\n\t${diagnostic.message}\n`
      });
    });
  }
  
  reportStatus('Compiling Java source code (TeaVM)...');
  teavmCompiler.clearSourceFiles();
  teavmCompiler.clearOutputFiles();
  teavmCompiler.addSourceFile("Main.java", code);
  
  const compileSuccess = teavmCompiler.compile();
  if (!compileSuccess) {
    throw new Error("Java compilation failed.");
  }
  
  reportStatus('Generating WebAssembly binary (TeaVM)...');
  const genSuccess = teavmCompiler.generateWebAssembly({
    outputName: "app",
    mainClass: "Main"
  });
  if (!genSuccess) {
    throw new Error("Wasm generation failed.");
  }
  
  reportStatus('Executing Java Program (TeaVM WASM)...');
  const generatedWasm = teavmCompiler.getWebAssemblyOutputFile("app.wasm");
  
  let stdoutBuffer = "";
  let stderrBuffer = "";
  
  const appInstance = await self.loadTeaVM(generatedWasm, {
    installImports(o) {
      o.teavmConsole.putcharStdout = (ch) => {
        if (ch === 0xA) {
          self.postMessage({ type: 'output', stream: 'stdout', text: stdoutBuffer + '\n' });
          stdoutBuffer = "";
        } else {
          stdoutBuffer += String.fromCharCode(ch);
        }
      };
      o.teavmConsole.putcharStderr = (ch) => {
        if (ch === 0xA) {
          self.postMessage({ type: 'output', stream: 'stderr', text: stderrBuffer + '\n' });
          stderrBuffer = "";
        } else {
          stderrBuffer += String.fromCharCode(ch);
        }
      };
    }
  });
  
  try {
    appInstance.exports.main([]);
    if (stdoutBuffer) {
      self.postMessage({ type: 'output', stream: 'stdout', text: stdoutBuffer + '\n' });
    }
    if (stderrBuffer) {
      self.postMessage({ type: 'output', stream: 'stderr', text: stderrBuffer + '\n' });
    }
    self.postMessage({ type: 'done' });
  } catch (err) {
    self.postMessage({ type: 'output', stream: 'stderr', text: 'Runtime Exception: ' + err.message + '\n' });
    self.postMessage({ type: 'done', error: true });
  }
}

// Message Router
self.onmessage = async (event) => {
  const { action, language, code } = event.data;
  
  if (action === 'run') {
    try {
      if (language === 'python') {
        await runPython(code);
      } else if (language === 'javascript') {
        await runJs(code);
      } else if (language === 'ruby') {
        await runRuby(code);
      } else if (language === 'lua') {
        await runLua(code);
      } else if (language === 'sqlite') {
        await runSql(code);
      } else if (language === 'c' || language === 'cpp') {
        await runC(code);
      } else if (language === 'java') {
        await runJava(code);
      }
    } catch (e) {
      self.postMessage({ type: 'output', stream: 'stderr', text: 'Fatal Worker Error: ' + e.message + '\n' });
      self.postMessage({ type: 'done', error: true });
    }
  }
};
