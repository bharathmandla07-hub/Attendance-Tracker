import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Check,
  X,
  Clock,
  Trash2,
  UserPlus,
  Play,
  Database,
  Sparkles,
  Terminal,
  Activity,
  Calendar,
  Code,
  GraduationCap,
  Save,
  HelpCircle,
  FileSpreadsheet,
  Layers,
  ArrowRight
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell
} from 'recharts';

// Define the schema types inside the UI
interface Student {
  id: string;
  name: string;
  roll_number: string;
  email: string;
}

interface AttendanceRecord {
  student_id: string;
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
  notes: string;
}

interface WebTerminalLine {
  type: 'input' | 'output' | 'error' | 'system';
  text: string;
  timestamp: string;
}

export default function App() {
  const [activeTheme, setActiveTheme] = useState<string>(() => localStorage.getItem('attendance_tracker_theme') || 'slate');
  const [pyodideLoaded, setPyodideLoaded] = useState<boolean>(false);
  const [pyodideLoadingStage, setPyodideLoadingStage] = useState<string>('Initializing sandbox...');
  const [pyodideError, setPyodideError] = useState<string | null>(null);

  // Lists synced from the Python namespace
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    // Align with our seeded dates
    return '2026-06-13';
  });

  // Database status and structure info
  const [dbStats, setDbStats] = useState<{
    total_students: number;
    total_records: number;
    total_present: number;
    schemas: { table: string; sql: string }[];
  }>({
    total_students: 0,
    total_records: 0,
    total_present: 0,
    schemas: []
  });

  // UI state management
  const [activeTab, setActiveTab] = useState<'dashboard' | 'students' | 'terminal' | 'concepts'>('dashboard');
  const [selectedConcept, setSelectedConcept] = useState<'tables' | 'storage'>('tables');

  // New student form inputs
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentRoll, setNewStudentRoll] = useState('');
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // Interactive Terminal inputs and lines
  const [terminalLines, setTerminalLines] = useState<WebTerminalLine[]>([
    { type: 'system', text: 'Python Attendance Sandbox v1.0.0 (WASM Native)', timestamp: '07:47:00' },
    { type: 'system', text: 'Type standard Python code to interact with the live database (sqlite3).', timestamp: '07:47:01' }
  ]);
  const [terminalInput, setTerminalInput] = useState('');
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Quick Action feedback logs at the bottom
  const [pythonExecutionLogs, setPythonExecutionLogs] = useState<string[]>([
    '# Python Virtual Kernel initialized.',
    '# Run: sqlite3.connect("attendance_system.db")',
    '# Seeded initial 5 student records successfully.'
  ]);

  // Keep a reference to the active pyodide instance
  const pyodideRef = useRef<any>(null);

  // Initialize Pyodide on mount
  useEffect(() => {
    async function loadPythonEnvironment() {
      try {
        setPyodideLoadingStage('Fetching WebAssembly files from CDN...');
        
        // Wait until loadPyodide is available globally
        let attempts = 0;
        while (!(window as any).loadPyodide) {
          await new Promise((r) => setTimeout(r, 200));
          attempts++;
          if (attempts > 50) {
            throw new Error('Pyodide took too long to load from CDN. Check your network or open in a new tab.');
          }
        }

        setPyodideLoadingStage('Booting sandboxed Python environment (Pyodide v0.26.2)...');
        const pyodide = await (window as any).loadPyodide();
        pyodideRef.current = pyodide;

        // Redirect Python print outputs to our web terminal
        pyodide.setStdout({
          batched: (text: string) => {
            appendTerminalOutput(text, 'output');
          }
        });

        pyodide.setStderr({
          batched: (text: string) => {
            appendTerminalOutput(text, 'error');
          }
        });

        setPyodideLoadingStage('Loading sqlite3 database module...');
        await pyodide.loadPackage("sqlite3");

        setPyodideLoadingStage('Executing core attendance_engine.py library...');
        
        // Load the core Python logic!
        const setupScript = `
import sqlite3
import json

# Setup core relational memory database
conn = sqlite3.connect('attendance_system.db')
cursor = conn.cursor()

# Enable foreign keys
cursor.execute('PRAGMA foreign_keys = ON;')

# Create Relational Tables to explain "Tables / Schema" concept
cursor.execute('''
CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    roll_number TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL
)
''')

cursor.execute('''
CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT,
    date TEXT,
    status TEXT,
    notes TEXT,
    FOREIGN KEY(student_id) REFERENCES students(id),
    UNIQUE(student_id, date)
)
''')
conn.commit()

# Core high-level functional APIs
def add_student(student_id, name, roll_number, email):
    try:
        cursor.execute(
            "INSERT INTO students (id, name, roll_number, email) VALUES (?, ?, ?, ?)",
            (student_id, name, roll_number, email)
        )
        conn.commit()
        return json.dumps({"success": True, "message": f"Added student: {name}"})
    except sqlite3.IntegrityError:
        return json.dumps({"success": False, "error": f"Integrity Conflict: Roll '{roll_number}' already exists."})
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

def mark_attendance(student_id, date, status, notes=""):
    try:
        cursor.execute('''
        INSERT OR REPLACE INTO attendance (student_id, date, status, notes)
        VALUES (?, ?, ?, ?)
        ''', (student_id, date, status, notes))
        conn.commit()
        return json.dumps({"success": True, "message": f"Attendance {status} recorded on {date}"})
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

def delete_student(student_id):
    try:
        # Delete attendance history first due to constraint, then student
        cursor.execute("DELETE FROM attendance WHERE student_id = ?", (student_id,))
        cursor.execute("DELETE FROM students WHERE id = ?", (student_id,))
        conn.commit()
        return json.dumps({"success": True, "message": f"Successfully deleted student and their attendance history."})
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

def fetch_students_list():
    cursor.execute("SELECT id, name, roll_number, email FROM students ORDER BY name ASC")
    rows = cursor.fetchall()
    res = []
    for r in rows:
        res.append({"id": r[0], "name": r[1], "roll_number": r[2], "email": r[3]})
    return json.dumps(res)

def fetch_attendance_list():
    cursor.execute("SELECT student_id, date, status, notes FROM attendance")
    rows = cursor.fetchall()
    res = []
    for r in rows:
        res.append({"student_id": r[0], "date": r[1], "status": r[2], "notes": r[3] or ""})
    return json.dumps(res)

def fetch_stats():
    cursor.execute("SELECT COUNT(*) FROM students")
    tot_st = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM attendance")
    tot_rec = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM attendance WHERE status = 'PRESENT'")
    tot_pres = cursor.fetchone()[0]
    
    # Get current SQLite database schema definition
    cursor.execute("SELECT name, sql FROM sqlite_master WHERE type='table' AND name != 'sqlite_sequence'")
    schemas_raw = cursor.fetchall()
    schemas = [{"table": r[0], "sql": r[1]} for r in schemas_raw]
    
    return json.dumps({
        "total_students": tot_st,
        "total_records": tot_rec,
        "total_present": tot_pres,
        "schemas": schemas
    })

def generate_csv():
    import csv
    import io
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Student ID", "Name", "Roll Number", "Date", "Status", "Notes"])
    
    cursor.execute('''
        SELECT s.id, s.name, s.roll_number, a.date, a.status, a.notes 
        FROM students s 
        LEFT JOIN attendance a ON s.id = a.student_id
        ORDER BY a.date DESC, s.name ASC
    ''')
    for r in cursor.fetchall():
        writer.writerow(r)
    return output.getvalue()

# Preseed some students data in Python
students_data = [
    ("s1", "Aria Vance", "ROLL-001", "aria.vance@school.edu"),
    ("s2", "Marcus Brody", "ROLL-002", "marcus.brody@school.edu"),
    ("s3", "Zoe Carter", "ROLL-003", "zoe.carter@school.edu"),
    ("s4", "Liam O'Connor", "ROLL-004", "liam.oconnor@school.edu"),
    ("s5", "Sophia Patel", "ROLL-005", "sophia.patel@school.edu")
]

for sid, name, roll, email in students_data:
    add_student(sid, name, roll, email)

# Record baseline attendance dates
dates = ["2026-06-11", "2026-06-12", "2026-06-13"]
attendance_records = [
    # 11th
    ("s1", "2026-06-11", "PRESENT"), ("s2", "2026-06-11", "PRESENT"), ("s3", "2026-06-11", "ABSENT"), ("s4", "2026-06-11", "LATE"), ("s5", "2026-06-11", "PRESENT"),
    # 12th
    ("s1", "2026-06-12", "PRESENT"), ("s2", "2026-06-12", "LATE"), ("s3", "2026-06-12", "EXCUSED"), ("s4", "2026-06-12", "PRESENT"), ("s5", "2026-06-12", "ABSENT"),
    # 13th
    ("s1", "2026-06-13", "PRESENT"), ("s2", "2026-06-13", "PRESENT"), ("s3", "2026-06-13", "ABSENT"), ("s4", "2026-06-13", "LATE")
]

for sid, dt, stat in attendance_records:
    mark_attendance(sid, dt, stat, "Preseeded standard class register")
`;

        await pyodide.runPythonAsync(setupScript);
        
        setPyodideLoadingStage('Synchronizing data grids...');
        syncStateFromPython(pyodide);
        
        setPyodideLoaded(true);
        appendTerminalOutput('Python engine loaded successfully! Type standard python to execute comments directly in the interpreter.', 'system');

      } catch (err: any) {
        console.error(err);
        setPyodideError(err.message || 'Unknown compilation error during WebAssembly execution.');
      }
    }

    loadPythonEnvironment();
  }, []);

  // Sync React lists directly from the Pyodide environment values
  const syncStateFromPython = (pyEngine = pyodideRef.current) => {
    if (!pyEngine) return;
    try {
      // 1. Fetch Students
      const studentsRaw = pyEngine.runPython('fetch_students_list()');
      const studentList = JSON.parse(studentsRaw);
      setStudents(studentList);

      // 2. Fetch Attendance
      const attendanceRaw = pyEngine.runPython('fetch_attendance_list()');
      const attendanceList = JSON.parse(attendanceRaw);
      setAttendance(attendanceList);

      // 3. Fetch Database metrics & Schemas
      const statsRaw = pyEngine.runPython('fetch_stats()');
      const parsedStats = JSON.parse(statsRaw);
      setDbStats(parsedStats);

    } catch (err: any) {
      console.error('Error synchronizing python states:', err);
    }
  };

  // Run a python piece and log the output cleanly
  const runPythonAction = (code: string, description: string) => {
    if (!pyodideRef.current) return null;
    try {
      // Log the command visually in execution tracker
      setPythonExecutionLogs(prev => [
        `>>> ${code}`,
        ...prev.slice(0, 15)
      ]);

      const result = pyodideRef.current.runPython(code);
      syncStateFromPython();
      return result;
    } catch (err: any) {
      setPythonExecutionLogs(prev => [
        `❌ Error running: ${code}`,
        `   => ${err.message}`,
        ...prev.slice(0, 15)
      ]);
      appendTerminalOutput(`Error executing: ${code}\n${err.message}`, 'error');
      return null;
    }
  };

  // Helper code to format current time for logs
  const getTimestamp = () => {
    const d = new Date();
    return d.toTimeString().split(' ')[0];
  };

  const appendTerminalOutput = (text: string, type: 'input' | 'output' | 'error' | 'system') => {
    setTerminalLines(prev => [...prev, {
      type,
      text: text.trim(),
      timestamp: getTimestamp()
    }]);
  };

  // Scroll to terminal bottom on new line
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalLines]);

  // Handle addition of a student via Python code execution
  const handleAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!newStudentName.trim() || !newStudentRoll.trim() || !newStudentEmail.trim()) {
      setFormError('All input fields are required');
      return;
    }

    const rollPattern = /^[A-Za-z0-9-]+$/;
    if (!rollPattern.test(newStudentRoll)) {
      setFormError('Roll number must be alphanumeric style (e.g., ROLL-105)');
      return;
    }

    // Generate unique ID based on Roll number
    const studentId = `s_${newStudentRoll.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

    // Execute through python interpreter
    const escapedName = newStudentName.replace(/"/g, '\\"');
    const escapedRoll = newStudentRoll.replace(/"/g, '\\"');
    const escapedEmail = newStudentEmail.replace(/"/g, '\\"');

    const pythonCode = `add_student("${studentId}", "${escapedName}", "${escapedRoll}", "${escapedEmail}")`;
    const jsonResult = runPythonAction(pythonCode, `Add Student: ${newStudentName}`);

    if (jsonResult) {
      const result = JSON.parse(jsonResult);
      if (result.success) {
        setFormSuccess(result.message);
        setNewStudentName('');
        setNewStudentRoll('');
        setNewStudentEmail('');
        appendTerminalOutput(`>>> ${pythonCode}\n${result.message}`, 'output');
      } else {
        setFormError(result.error);
      }
    }
  };

  // Quick action: Delete Student
  const handleDeleteStudent = (studentId: string, studentName: string) => {
    if (confirm(`Are you sure you want to delete ${studentName}? This executes DB cascades inside SQLite.`)) {
      const pythonCode = `delete_student("${studentId}")`;
      const jsonResult = runPythonAction(pythonCode, `Deleted Student ID ${studentId}`);
      if (jsonResult) {
        const result = JSON.parse(jsonResult);
        appendTerminalOutput(`>>> ${pythonCode}\n${result.message}`, 'output');
      }
    }
  };

  // Handle toggling of individual student attendance cell dynamically inside the table
  const handleMarkAttendanceCell = (studentId: string, date: string, currentStatus: string) => {
    const statuses: ('PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED')[] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];
    const currentIndex = statuses.indexOf(currentStatus as any);
    const nextStatus = statuses[(currentIndex + 1) % statuses.length];

    const pythonCode = `mark_attendance("${studentId}", "${date}", "${nextStatus}", "Status updated via interactive matrix grid")`;
    const jsonResult = runPythonAction(pythonCode, `Updated ID ${studentId} to ${nextStatus}`);
    
    if (jsonResult) {
      const result = JSON.parse(jsonResult);
      appendTerminalOutput(`>>> ${pythonCode}\n${result.message}`, 'output');
    }
  };

  // Force Set Status directly from UI menu
  const setAttendanceValue = (studentId: string, status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED') => {
    const pythonCode = `mark_attendance("${studentId}", "${selectedDate}", "${status}", "Status updated via quick controls")`;
    const jsonResult = runPythonAction(pythonCode, `Marked ${studentId} as ${status}`);
    
    if (jsonResult) {
      const result = JSON.parse(jsonResult);
      appendTerminalOutput(`>>> ${pythonCode}\n${result.message}`, 'output');
    }
  };

  // Run customized command from the terminal text field
  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalInput.trim()) return;

    const command = terminalInput.trim();
    appendTerminalOutput(`>>> ${command}`, 'input');
    setTerminalInput('');

    try {
      const py = pyodideRef.current;
      if (!py) {
        appendTerminalOutput('Python environment is not fully loaded.', 'error');
        return;
      }

      // Automatically capture return values for expressions
      const result = py.runPython(command);
      if (result !== undefined && result !== null) {
        // Convert Python object arrays to strings beautifully
        let outputText = result.toString();
        if (typeof result === 'object' && result?.toJs) {
          outputText = JSON.stringify(result.toJs({ dict_converter: Object.fromEntries }), null, 2);
        }
        appendTerminalOutput(outputText, 'output');
      }
      
      // Update data state just in case custom variables edited db
      syncStateFromPython();
    } catch (err: any) {
      appendTerminalOutput(err.message, 'error');
    }
  };

  // Write terminal auto command templates
  const injectAndRunCommand = (cmd: string) => {
    setTerminalInput(cmd);
    setTimeout(() => {
      // Create a pseudo submit
      appendTerminalOutput(`>>> ${cmd}`, 'input');
      try {
        const result = pyodideRef.current.runPython(cmd);
        if (result !== undefined && result !== null) {
          appendTerminalOutput(result.toString(), 'output');
        }
        syncStateFromPython();
      } catch (err: any) {
        appendTerminalOutput(err.message, 'error');
      }
    }, 100);
  };

  // Python Database file exporter (downloads real bytes of the live SQLite storage)
  const downloadSQLiteDatabase = () => {
    try {
      const py = pyodideRef.current;
      if (!py) return;
      const data = py.FS.readFile('attendance_system.db');
      const blob = new Blob([data], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'attendance_system.db';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setPythonExecutionLogs(prev => [
        `>>> # Read sqlite binary stream of "attendance_system.db"`,
        `>>> # Download triggered: File size ${data.length} bytes`,
        ...prev
      ]);
      appendTerminalOutput('Downloaded live active sqlite binary database file: "attendance_system.db"', 'system');
    } catch (err: any) {
      appendTerminalOutput(`Database export failed: ${err.message}`, 'error');
    }
  };

  // Export CSV via Python standard library StringIO generator
  const downloadCSVData = () => {
    try {
      const py = pyodideRef.current;
      if (!py) return;
      const csvStr = py.runPython('generate_csv()');
      const blob = new Blob([csvStr], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance_report_${selectedDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setPythonExecutionLogs(prev => [
        `>>> # Executed generate_csv() inside Python CSV stream modules`,
        ...prev
      ]);
      appendTerminalOutput('Successfully exported school register status report to CSV format.', 'system');
    } catch (err: any) {
      appendTerminalOutput(`CSV generation failed: ${err.message}`, 'error');
    }
  };

  // Get metrics calculations matching Python outputs
  const getAttendanceRateForDate = (dateString: string) => {
    const recordsOnDate = attendance.filter(r => r.date === dateString);
    if (!recordsOnDate.length) return 0;
    const presentCount = recordsOnDate.filter(r => r.status === 'PRESENT' || r.status === 'LATE').length;
    return Math.round((presentCount / recordsOnDate.length) * 100);
  };

  // Build structural stats for visual chart
  const getDailyTrendData = () => {
    const days = Array.from(new Set(attendance.map(a => a.date))).sort();
    return days.map(d => {
      const recs = attendance.filter(a => a.date === d);
      const present = recs.filter(r => r.status === 'PRESENT').length;
      const absent = recs.filter(r => r.status === 'ABSENT').length;
      const late = recs.filter(r => r.status === 'LATE').length;
      const excused = recs.filter(r => r.status === 'EXCUSED').length;
      return {
        date: d,
        Present: present,
        Absent: absent,
        Late: late,
        Excused: excused,
        Rate: recs.length ? Math.round(((present + late) / recs.length) * 100) : 0
      };
    });
  };

  const getStatusRatioData = () => {
    const selectedRecords = attendance.filter(a => a.date === selectedDate);
    if (!selectedRecords.length) return [];
    
    const present = selectedRecords.filter(r => r.status === 'PRESENT').length;
    const absent = selectedRecords.filter(r => r.status === 'ABSENT').length;
    const late = selectedRecords.filter(r => r.status === 'LATE').length;
    const excused = selectedRecords.filter(r => r.status === 'EXCUSED').length;

    return [
      { name: 'Present', value: present, color: '#10b981' },
      { name: 'Absent', value: absent, color: '#f43f5e' },
      { name: 'Late', value: late, color: '#f59e0b' },
      { name: 'Excused', value: excused, color: '#6366f1' }
    ].filter(v => v.value > 0);
  };

  const selectedDateAttendance = attendance.filter(a => a.date === selectedDate);
  const trendData = getDailyTrendData();
  const ratioData = getStatusRatioData();

  return (
    <div className={`min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans selection:bg-teal-500 selection:text-slate-950 theme-${activeTheme}`} id="main_root">
      <style>{`
        /* Overrides for theme choices */

        /* ---- LIGHT THEME (Warm Sand / Paper) ---- */
        .theme-light.min-h-screen {
          background-color: #fcfbf7 !important;
          color: #1e293b !important;
        }
        .theme-light #header_section {
          background-color: rgba(255, 255, 255, 0.95) !important;
          border-color: #cbd5e1 !important;
        }
        .theme-light #header_section h1 {
          background: linear-gradient(135deg, #1e3a8a, #0d9488) !important;
          -webkit-background-clip: text !important;
          -webkit-text-fill-color: transparent !important;
        }
        .theme-light .text-slate-400,
        .theme-light .text-slate-500 {
          color: #475569 !important;
        }
        .theme-light .bg-slate-950\\/40,
        .theme-light .bg-slate-950\\/60,
        .theme-light .bg-slate-950,
        .theme-light #grid_management_card,
        .theme-light #add_student_form_card,
        .theme-light #students_directory_card,
        .theme-light #terminal_lines_box,
        .theme-light #developer_tools_card,
        .theme-light #educational_helper,
        .theme-light #navigation_tabs,
        .theme-light #charts_card {
          background-color: #ffffff !important;
          border-color: #cbd5e1 !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05) !important;
        }
        .theme-light .border-slate-800,
        .theme-light .border-slate-850,
        .theme-light .border-slate-700,
        .theme-light .divide-slate-800 > * {
          border-color: #cbd5e1 !important;
          border-bottom-color: #cbd5e1 !important;
        }
        .theme-light .text-slate-100,
        .theme-light .text-slate-200,
        .theme-light .text-slate-300 {
          color: #1e293b !important;
        }
        .theme-light input,
        .theme-light select,
        .theme-light #terminal_text_field,
        .theme-light .bg-slate-900 {
          background-color: #f1f5f9 !important;
          border-color: #cbd5e1 !important;
          color: #1e293b !important;
        }
        .theme-light #navigation_tabs button {
          color: #475569 !important;
        }
        .theme-light #navigation_tabs button:not([id*="tab_btn_dashboard"]):hover {
          background-color: #f1f5f9 !important;
        }
        .theme-light #register_matrix_table thead {
          background-color: #f1f5f9 !important;
          color: #475569 !important;
        }
        .theme-light #terminal_lines_box {
          background-color: #fafbfc !important;
          color: #1e293b !important;
        }

        /* ---- EMERALD CHALKBOARD ---- */
        .theme-emerald.min-h-screen {
          background-color: #061f14 !important;
          color: #ecfdf5 !important;
        }
        .theme-emerald #header_section {
          background-color: rgba(4, 20, 13, 0.95) !important;
          border-color: #065f46 !important;
        }
        .theme-emerald #header_section h1 {
          background: linear-gradient(135deg, #34d399, #6ee7b7) !important;
          -webkit-background-clip: text !important;
          -webkit-text-fill-color: transparent !important;
        }
        .theme-emerald .bg-slate-950\\/40,
        .theme-emerald .bg-slate-950\\/60,
        .theme-emerald .bg-slate-950,
        .theme-emerald #grid_management_card,
        .theme-emerald #add_student_form_card,
        .theme-emerald #students_directory_card,
        .theme-emerald #terminal_lines_box,
        .theme-emerald #developer_tools_card,
        .theme-emerald #educational_helper,
        .theme-emerald #navigation_tabs,
        .theme-emerald #charts_card {
          background-color: #02120b !important;
          border-color: #065f46 !important;
        }
        .theme-emerald .border-slate-800,
        .theme-emerald .border-slate-850,
        .theme-emerald .border-slate-705,
        .theme-emerald .divide-slate-800 > * {
          border-color: #065f46 !important;
          border-bottom-color: #065f46 !important;
        }
        .theme-emerald .text-slate-150,
        .theme-emerald .text-slate-200,
        .theme-emerald .text-slate-300 {
          color: #ecfdf5 !important;
        }
        .theme-emerald input,
        .theme-emerald select,
        .theme-emerald #terminal_text_field,
        .theme-emerald .bg-slate-900 {
          background-color: #03180f !important;
          border-color: #047857 !important;
          color: #ecfdf5 !important;
        }
        .theme-emerald .text-slate-400 {
          color: #a7f3d0 !important;
        }

        /* ---- RETRO AMBER THEME ---- */
        .theme-amber.min-h-screen {
          background-color: #120b02 !important;
          color: #fef3c7 !important;
        }
        .theme-amber #header_section {
          background-color: rgba(10, 5, 2, 0.95) !important;
          border-color: #78350f !important;
        }
        .theme-amber #header_section h1 {
          background: linear-gradient(135deg, #f59e0b, #fbbf24) !important;
          -webkit-background-clip: text !important;
          -webkit-text-fill-color: transparent !important;
        }
        .theme-amber .bg-slate-950\\/40,
        .theme-amber .bg-slate-950\\/60,
        .theme-amber .bg-slate-950,
        .theme-amber #grid_management_card,
        .theme-amber #add_student_form_card,
        .theme-amber #students_directory_card,
        .theme-amber #terminal_lines_box,
        .theme-amber #developer_tools_card,
        .theme-amber #educational_helper,
        .theme-amber #navigation_tabs,
        .theme-amber #charts_card {
          background-color: #050200 !important;
          border-color: #78350f !important;
        }
        .theme-amber .border-slate-800,
        .theme-amber .border-slate-850,
        .theme-amber .divide-slate-800 > * {
          border-color: #78350f !important;
          border-bottom-color: #78350f !important;
        }
        .theme-amber input,
        .theme-amber select,
        .theme-amber #terminal_text_field,
        .theme-amber .bg-slate-900 {
          background-color: #0e0700 !important;
          border-color: #92400e !important;
          color: #fef3c7 !important;
        }
        .theme-amber .text-slate-400 {
          color: #fcd34d !important;
        }

        /* ---- COSMIC PURPLE ---- */
        .theme-cyber.min-h-screen {
          background-color: #0a0414 !important;
          color: #fdf4ff !important;
        }
        .theme-cyber #header_section {
          background-color: rgba(6, 2, 12, 0.95) !important;
          border-color: #701a75 !important;
        }
        .theme-cyber #header_section h1 {
          background: linear-gradient(135deg, #e9d5ff, #f472b6) !important;
          -webkit-background-clip: text !important;
          -webkit-text-fill-color: transparent !important;
        }
        .theme-cyber .bg-slate-950\\/40,
        .theme-cyber .bg-slate-950\\/60,
        .theme-cyber .bg-slate-950,
        .theme-cyber #grid_management_card,
        .theme-cyber #add_student_form_card,
        .theme-cyber #students_directory_card,
        .theme-cyber #terminal_lines_box,
        .theme-cyber #developer_tools_card,
        .theme-cyber #educational_helper,
        .theme-cyber #navigation_tabs,
        .theme-cyber #charts_card {
          background-color: #020005 !important;
          border-color: #701a75 !important;
        }
        .theme-cyber .border-slate-800,
        .theme-cyber .border-slate-850,
        .theme-cyber .divide-slate-800 > * {
          border-color: #701a75 !important;
          border-bottom-color: #701a75 !important;
        }
        .theme-cyber input,
        .theme-cyber select,
        .theme-cyber #terminal_text_field,
        .theme-cyber .bg-slate-900 {
          background-color: #0e051a !important;
          border-color: #86198f !important;
          color: #fdf4ff !important;
        }
        .theme-cyber .text-slate-400 {
          color: #e879f9 !important;
        }
      `}</style>

      {/* Top Professional Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur px-6 py-4 sticky top-0 z-40" id="header_section">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 md:p-3 bg-gradient-to-tr from-teal-500 to-indigo-500 rounded-xl shadow-lg shadow-teal-500/10">
              <GraduationCap className="h-6 w-6 text-slate-950" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-teal-400 via-emerald-300 to-indigo-400 bg-clip-text text-transparent">
                Attendance Tracker
              </h1>
              <p className="text-xs text-slate-400">
                WASM Core Engine running real-time SQLite relational indexes
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Theme Selector */}
            <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-1.5 text-xs">
              <span className="text-slate-400 font-medium">Theme:</span>
              <select
                value={activeTheme}
                onChange={(e) => {
                  const val = e.target.value;
                  setActiveTheme(val);
                  localStorage.setItem('attendance_tracker_theme', val);
                }}
                className="bg-transparent text-teal-400 font-medium outline-none cursor-pointer focus:ring-0"
              >
                <option value="slate" className="bg-slate-955 text-slate-200">Slate Tech</option>
                <option value="light" className="bg-white text-slate-800">Warm Sand</option>
                <option value="emerald" className="bg-slate-955 text-slate-200">Classroom Chalkboard</option>
                <option value="amber" className="bg-slate-955 text-slate-200">Retro Amber</option>
                <option value="cyber" className="bg-slate-955 text-slate-200">Cosmic Purple</option>
              </select>
            </div>

            {/* Engine Status Bar */}
            <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-lg px-4 py-1.5 text-xs">
              <span className="flex h-2 w-2 relative">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${pyodideLoaded ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${pyodideLoaded ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
              </span>
              <span className="text-slate-400 font-medium">Python Engine:</span>
              {pyodideLoaded ? (
                <span className="text-teal-400 font-mono">READY (Python v3.12.1 + sqlite3)</span>
              ) : pyodideError ? (
                <span className="text-rose-400 font-mono">ERROR LOADING SANBOX</span>
              ) : (
                <span className="text-amber-400 font-mono animate-pulse">{pyodideLoadingStage}</span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6" id="main_layout">
        
        {/* Connection Failure Splash Screen */}
        <AnimatePresence>
          {!pyodideLoaded && !pyodideError && (
            <motion.div 
              initial={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="col-span-12 flex flex-col items-center justify-center py-20 text-center bg-slate-950/40 rounded-2xl border border-slate-800"
              id="loading_sandbox_screen"
            >
              <div className="relative mb-6">
                <Database className="h-14 w-14 text-teal-400 animate-spin" />
                <Terminal className="h-6 w-6 text-indigo-400 absolute bottom-0 right-0" />
              </div>
              <h3 className="text-lg font-semibold tracking-tight">Assembling Sandboxed Execution Runtime</h3>
              <p className="text-sm text-slate-400 mt-2 max-w-md">
                We are compiling standard CPython interpreter libraries directly to WebAssembly to facilitate actual, locally executing SQLite databases.
              </p>
              <div className="mt-6 flex flex-col items-center gap-2">
                <span className="text-xs bg-slate-900 px-4 py-2 rounded-full border border-slate-800 text-teal-400 font-mono">
                  {pyodideLoadingStage}
                </span>
                <span className="text-xs text-slate-500 italic">This usually completes within a few moments!</span>
              </div>
            </motion.div>
          )}

          {pyodideError && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              className="col-span-12 p-8 bg-rose-950/20 border border-rose-900/50 rounded-2xl text-center"
              id="error_sandbox_screen"
            >
              <X className="h-10 w-10 text-rose-500 mx-auto mb-4" />
              <h3 className="text-lg font-bold">Failed to load Python Interpreter</h3>
              <p className="text-sm text-rose-300 mt-2 max-w-xl mx-auto">
                {pyodideError}
              </p>
              <p className="text-xs text-slate-500 mt-4">
                Verify you are connected to the network or click the refresh button to reload CDN binaries.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {pyodideLoaded && (
          <>
            {/* Left Column - Navigation and Interactive Workspace */}
            <div className="lg:col-span-8 flex flex-col gap-6" id="left_column">
              
              {/* Tab Navigation Menu */}
              <div className="flex border-b border-slate-800 bg-slate-950/40 p-1.5 rounded-xl gap-2" id="navigation_tabs">
                {[
                  { id: 'dashboard', label: 'Attendance Dashboard', icon: Activity },
                  { id: 'students', label: 'Student Registers', icon: UserPlus },
                  { id: 'terminal', label: 'Interactive IDE Console', icon: Terminal },
                  { id: 'concepts', label: 'Python & Storage Theory', icon: Layers }
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs md:text-sm font-medium transition-all ${
                        isActive 
                        ? 'bg-gradient-to-r from-teal-500/20 to-indigo-500/20 border border-teal-500/30 text-teal-300 shadow' 
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                      }`}
                      id={`tab_btn_${tab.id}`}
                    >
                      <Icon className={`h-4 w-4 ${isActive ? 'text-teal-400' : 'text-slate-400'}`} />
                      <span className="hidden md:inline">{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Tab Contents */}
              <div className="flex-1" id="tab_contents_container">
                
                {/* Tab 1: Dashboard */}
                {activeTab === 'dashboard' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-6"
                    id="tab_dashboard"
                  >
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" id="stat_cards">
                      <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                        <div>
                          <p className="text-xs text-slate-400">Active Student Register</p>
                          <p className="text-2xl font-bold mt-1 text-slate-100">{dbStats.total_students}</p>
                          <p className="text-xs text-slate-500 mt-1">Queried from TABLE: students</p>
                        </div>
                        <div className="h-10 w-10 bh-slate-900 rounded-lg flex items-center justify-center bg-teal-500/10 border border-teal-500/30">
                          <span className="text-sm font-bold text-teal-400 font-mono">SQLite</span>
                        </div>
                      </div>

                      <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                        <div>
                          <p className="text-xs text-slate-400">Total System Entries</p>
                          <p className="text-2xl font-bold mt-1 text-slate-100">{dbStats.total_records}</p>
                          <p className="text-xs text-slate-500 mt-1">Total SQLite historical rows</p>
                        </div>
                        <div className="h-10 w-10 bh-slate-900 rounded-lg flex items-center justify-center bg-indigo-500/10 border border-indigo-500/30">
                          <Database className="h-5 w-5 text-indigo-400" />
                        </div>
                      </div>

                      <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                        <div>
                          <p className="text-xs text-slate-400">Today's Attendance Rate</p>
                          <p className="text-2xl font-bold mt-1 text-slate-100">{getAttendanceRateForDate(selectedDate)}%</p>
                          <p className="text-xs text-slate-500 mt-1">For selected date: {selectedDate}</p>
                        </div>
                        <div className="h-10 w-10 bh-slate-900 rounded-lg flex items-center justify-center bg-emerald-500/10 border border-emerald-500/30">
                          <Activity className="h-5 w-5 text-emerald-400" />
                        </div>
                      </div>
                    </div>

                    {/* Attendance Grid & Selector */}
                    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-5" id="grid_management_card">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
                        <div>
                          <h3 className="text-md font-semibold text-slate-100 flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-teal-400" />
                            Register Matrix For {selectedDate}
                          </h3>
                          <p className="text-xs text-slate-400 mt-1">
                            Click any status indicator to cycle through PRESENT, ABSENT, LATE, or EXCUSED (executed live in DB)
                          </p>
                        </div>

                        {/* Date selection input */}
                        <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-700">
                          <span className="text-xs text-slate-400">Date index:</span>
                          <input 
                            type="date" 
                            value={selectedDate}
                            onChange={(e) => {
                              setSelectedDate(e.target.value);
                            }}
                            className="bg-transparent text-xs text-slate-100 focus:outline-none focus:ring-0 cursor-pointer text-right"
                          />
                        </div>
                      </div>

                      {/* Main Register Table */}
                      <div className="overflow-x-auto rounded-lg border border-slate-800" id="matrix_table_responsive">
                        <table className="min-w-full divide-y divide-slate-800 text-left text-xs" id="register_matrix_table">
                          <thead className="bg-slate-900 text-slate-400">
                            <tr>
                              <th scope="col" className="px-4 py-3 font-medium">Roll Number</th>
                              <th scope="col" className="px-4 py-3 font-medium">Student Name</th>
                              <th scope="col" className="px-4 py-3 font-medium text-center">Status On {selectedDate}</th>
                              <th scope="col" className="px-4 py-3 font-medium">Quick Batch Toggle</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800 bg-slate-950/30">
                            {students.map((student) => {
                              const record = selectedDateAttendance.find(a => a.student_id === student.id);
                              const currentStatus = record ? record.status : 'ABSENT'; // Default fallback

                              // Define visual pills matching statuses
                              const pills: Record<string, { bg: string; text: string; icon: any }> = {
                                PRESENT: { bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', text: 'Present', icon: Check },
                                ABSENT: { bg: 'bg-rose-500/10 text-rose-400 border-rose-500/30', text: 'Absent', icon: X },
                                LATE: { bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30', text: 'Late', icon: Clock },
                                EXCUSED: { bg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30', text: 'Excused', icon: Sparkles }
                              };

                              const PillData = pills[currentStatus] || pills['ABSENT'];
                              const StatusIcon = PillData.icon;

                              return (
                                <tr key={student.id} className="hover:bg-slate-800/20 transition-colors">
                                  <td className="px-4 py-3 whitespace-nowrap font-mono font-medium text-slate-300">
                                    {student.roll_number}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap">
                                    <div>
                                      <p className="font-semibold text-slate-200">{student.name}</p>
                                      <p className="text-[10px] text-slate-500">{student.email}</p>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-center">
                                    <button 
                                      onClick={() => handleMarkAttendanceCell(student.id, selectedDate, currentStatus)}
                                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-semibold cursor-pointer select-none shadow-sm transition-all focus:outline-none hover:brightness-110 active:scale-95 ${PillData.bg}`}
                                      title="Click to cycle status"
                                    >
                                      <StatusIcon className="h-3.5 w-3.5" />
                                      {PillData.text}
                                    </button>
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap">
                                    <div className="flex items-center gap-1">
                                      <button 
                                        onClick={() => setAttendanceValue(student.id, 'PRESENT')}
                                        className="p-1 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition"
                                        title="Mark Present"
                                      >
                                        <Check className="h-3 w-3" />
                                      </button>
                                      <button 
                                        onClick={() => setAttendanceValue(student.id, 'ABSENT')}
                                        className="p-1 rounded bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 transition"
                                        title="Mark Absent"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                      <button 
                                        onClick={() => setAttendanceValue(student.id, 'LATE')}
                                        className="p-1 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 transition"
                                        title="Mark Late"
                                      >
                                        <Clock className="h-3 w-3" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            
                            {students.length === 0 && (
                              <tr>
                                <td colSpan={4} className="text-center py-8 text-slate-500">
                                  No student registers loaded in the active Python system database block. Add some under "Student Registers" tab.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Export tools */}
                      <div className="flex gap-3 justify-end mt-4 text-xs">
                        <button
                          onClick={downloadCSVData}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 cursor-pointer shadow"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                          Python generate_csv() Export
                        </button>
                        <button
                          onClick={downloadSQLiteDatabase}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500 text-slate-950 font-semibold hover:bg-teal-400 cursor-pointer shadow shadow-teal-500/10 animate"
                        >
                          <Database className="h-3.5 w-3.5 text-slate-950" />
                          Download Live SQLite .db File
                        </button>
                      </div>
                    </div>

                    {/* Recharts Analytics Section */}
                    {trendData.length > 0 && (
                      <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-5" id="charts_card">
                        <h3 className="text-md font-semibold text-slate-100 flex items-center gap-2 mb-4">
                          <Activity className="h-4 w-4 text-teal-400" />
                          Python SQL Analytics: Daily Attendance Count Stack
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                          {/* Daily Bar Stack Chart */}
                          <div className="md:col-span-8 h-64" id="bar_chart_host">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={trendData}
                                margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                                <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                                <ChartTooltip 
                                  contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '8px' }}
                                  labelStyle={{ color: '#94a3b8', fontSize: '12px', fontWeight: 'bold' }}
                                />
                                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                <Bar dataKey="Present" stackId="a" fill="#10b981" />
                                <Bar dataKey="Late" stackId="a" fill="#f59e0b" />
                                <Bar dataKey="Excused" stackId="a" fill="#6366f1" />
                                <Bar dataKey="Absent" stackId="a" fill="#f43f5e" />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>

                          {/* Today's pie chart */}
                          <div className="md:col-span-4 flex flex-col justify-center items-center" id="pie_chart_host">
                            {ratioData.length > 0 ? (
                              <>
                                <p className="text-xs text-slate-400 font-semibold mb-2">Today's Ratio Breakdown</p>
                                <div className="h-36 w-full relative">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                      <Pie
                                        data={ratioData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={30}
                                        outerRadius={50}
                                        paddingAngle={4}
                                        dataKey="value"
                                      >
                                        {ratioData.map((entry, index) => (
                                          <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                      </Pie>
                                      <ChartTooltip
                                        contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '8px' }}
                                      />
                                    </PieChart>
                                  </ResponsiveContainer>
                                  {/* Center text on pie */}
                                  <div className="absolute inset-0 flex flex-col justify-center items-center pointer-events-none">
                                    <span className="text-lg font-bold font-mono text-slate-100">
                                      {getAttendanceRateForDate(selectedDate)}%
                                    </span>
                                    <span className="text-[9px] text-slate-500 font-semibold tracking-wider">RATE</span>
                                  </div>
                                </div>
                                
                                <div className="flex flex-wrap gap-2 justify-center mt-2 text-[10px]" id="pie_chart_legend">
                                  {ratioData.map((entry, index) => (
                                    <div key={index} className="flex items-center gap-1 text-slate-300">
                                      <span className="h-2 w-2 rounded-full inline-block" style={{ backgroundColor: entry.color }}></span>
                                      <span>{entry.name}: {entry.value}</span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            ) : (
                              <div className="text-center text-slate-500 py-6 text-xs">
                                No attendance records flagged for today's selection.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Tab 2: Students directory */}
                {activeTab === 'students' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-1 md:grid-cols-12 gap-6"
                    id="tab_students"
                  >
                    
                    {/* Add Student Card Form (Relates to: Add student names) */}
                    <div className="md:col-span-4 bg-slate-950/60 border border-slate-800 rounded-xl p-5" id="add_student_form_card">
                      <h3 className="text-md font-semibold text-slate-100 flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
                        <UserPlus className="h-4 w-4 text-teal-400" />
                        Execute add_student()
                      </h3>

                      <form onSubmit={handleAddStudent} className="flex flex-col gap-4 text-xs" id="add_student_form">
                        
                        <div>
                          <label className="block text-slate-400 font-semibold mb-1">Student Full Name</label>
                          <input 
                            type="text"
                            placeholder="e.g. Liam Thompson"
                            value={newStudentName}
                            onChange={(e) => setNewStudentName(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-slate-400 font-semibold mb-1">Unique Roll/Index ID</label>
                          <input 
                            type="text"
                            placeholder="e.g. ROLL-006"
                            value={newStudentRoll}
                            onChange={(e) => setNewStudentRoll(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
                            required
                          />
                          <p className="text-[10px] text-slate-500 mt-1">This acts as the unique index column</p>
                        </div>

                        <div>
                          <label className="block text-slate-400 font-semibold mb-1">E-mail Address</label>
                          <input 
                            type="email"
                            placeholder="e.g. liam@school-edu.org"
                            value={newStudentEmail}
                            onChange={(e) => setNewStudentEmail(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
                            required
                          />
                        </div>

                        {formError && (
                          <div className="p-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 animate-pulse">
                            <X className="h-3.5 w-3.5 shrink-0" />
                            {formError}
                          </div>
                        )}

                        {formSuccess && (
                          <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-[11px] font-semibold flex items-center gap-1.5">
                            <Check className="h-3.5 w-3.5 shrink-0" />
                            {formSuccess}
                          </div>
                        )}

                        <button 
                          type="submit"
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold transition shadow-md shadow-teal-500/10 cursor-pointer"
                        >
                          <Play className="h-3.5 w-3.5 fill-slate-950 stroke-slate-950" />
                          Execute Python API Code
                        </button>

                      </form>

                      {/* Code equivalent display */}
                      <div className="mt-6 bg-slate-900 border border-slate-800 rounded-lg p-3" id="code_snippet_box">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1.5">
                          <span className="text-[10px] text-slate-500 font-mono">CODE SYNC EQUIVALENT</span>
                          <span className="text-[9px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded px-1">SQLite3</span>
                        </div>
                        <pre className="text-[10px] font-mono text-teal-400 overflow-x-auto whitespace-pre-wrap leading-relaxed">
{`# What clicking the button executes:
import sqlite3
conn = sqlite3.connect('attendance.db')
cursor = conn.cursor()

cursor.execute(
  "INSERT INTO students (id, name, roll_number, email) VALUES (?,?,?,?)",
  ("${newStudentRoll ? 's_' + newStudentRoll.toLowerCase().replace(/[^a-z0-9]/g, '') : 's_...'}","${newStudentName || '...'}","${newStudentRoll || '...'}","${newStudentEmail || '...'} ")
)
conn.commit()`}
                        </pre>
                      </div>
                    </div>

                    {/* Student List Register Table */}
                    <div className="md:col-span-8 bg-slate-950/60 border border-slate-800 rounded-xl p-5" id="students_directory_card">
                      <div className="border-b border-slate-800 pb-4 mb-4">
                        <h3 className="text-md font-semibold text-slate-100 flex items-center gap-2">
                          <Database className="h-4 w-4 text-teal-400" />
                          Class Register (TABLE: students)
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">
                          Live SQLite data row contents. Deleting cascades attendance row indexes.
                        </p>
                      </div>

                      <div className="overflow-x-auto rounded-lg border border-slate-800" id="directory_table_host">
                        <table className="min-w-full divide-y divide-slate-800 text-left text-xs" id="directory_table">
                          <thead className="bg-slate-900 text-slate-400">
                            <tr>
                              <th className="px-4 py-3 font-medium">Unique Key (id)</th>
                              <th className="px-4 py-3 font-medium">Roll Number</th>
                              <th className="px-4 py-3 font-medium">Full Name</th>
                              <th className="px-4 py-3 font-medium">E-mail</th>
                              <th className="px-4 py-3 font-medium text-right">DB Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800 bg-slate-950/30">
                            {students.map((st) => (
                              <tr key={st.id} className="hover:bg-slate-800/10 transition-colors">
                                <td className="px-4 py-3 whitespace-nowrap font-mono text-[10px] text-teal-400 font-medium">
                                  {st.id}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap font-mono font-medium">
                                  {st.roll_number}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-slate-200 font-bold">
                                  {st.name}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-slate-400">
                                  {st.email}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-right">
                                  <button
                                    onClick={() => handleDeleteStudent(st.id, st.name)}
                                    className="p-1.5 rounded-md hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 cursor-pointer border border-transparent hover:border-rose-500/20 transition-all active:scale-95"
                                    title="Delete from DB"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}

                            {students.length === 0 && (
                              <tr>
                                <td colSpan={5} className="text-center py-10 text-slate-500 font-medium">
                                  No student rows currently inside table "students". Use the Add Student form to insert raw rows.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Tab 3: Interactive Console Terminal & scratchpad */}
                {activeTab === 'terminal' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-6"
                    id="tab_terminal"
                  >
                    <div className="bg-slate-950 rounded-xl border border-slate-800 p-5 flex flex-col h-[520px] shadow-2xl relative overflow-hidden" id="raw_console_layout">
                      
                      {/* Terminal header */}
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1.5">
                            <span className="h-3 w-3 rounded-full bg-rose-500 inline-block"></span>
                            <span className="h-3 w-3 rounded-full bg-amber-500 inline-block"></span>
                            <span className="h-3 w-3 rounded-full bg-emerald-500 inline-block"></span>
                          </div>
                          <span className="text-xs text-slate-400 font-mono select-none px-2 border-l border-slate-800">
                            interactive_python_shell.sh
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setTerminalLines([
                                { type: 'system', text: 'Terminal output flushed but python persistence cache remains intact.', timestamp: getTimestamp() }
                              ]);
                            }}
                            className="bg-slate-900 hover:bg-slate-800 border border-slate-800 px-2 py-1 rounded text-[10px] font-mono text-slate-400 cursor-pointer transition select-none"
                          >
                            Clear Screen
                          </button>
                        </div>
                      </div>

                      {/* Scrollable console view */}
                      <div className="flex-1 overflow-y-auto mb-4 font-mono text-xs space-y-2 pr-2 scrollbar-thin" id="terminal_history_view">
                        {terminalLines.map((line, idx) => (
                          <div key={idx} className="flex gap-3 leading-relaxed">
                            <span className="text-slate-600 text-[10px] select-none grow-0 shrink-0 w-12">{line.timestamp}</span>
                            <span className={`w-full whitespace-pre-wrap ${
                              line.type === 'input' 
                              ? 'text-teal-300 font-semibold' 
                              : line.type === 'error' 
                              ? 'text-rose-400 bg-rose-950/20 p-1.5 rounded border border-rose-500/10' 
                              : line.type === 'system'
                              ? 'text-indigo-400 font-medium'
                              : 'text-slate-300'
                            }`}>
                              {line.text}
                            </span>
                          </div>
                        ))}
                        <div ref={terminalEndRef} />
                      </div>

                      {/* Input terminal editor form */}
                      <form onSubmit={handleTerminalSubmit} className="flex gap-3 border-t border-slate-800 pt-3" id="terminal_input_form">
                        <span className="font-mono text-teal-400 select-none text-xs flex items-center">&gt;&gt;&gt;</span>
                        <input
                          type="text"
                          value={terminalInput}
                          onChange={(e) => setTerminalInput(e.target.value)}
                          placeholder="Type Python statements (e.g. print(cursor.execute('select * from students').fetchall()))"
                          className="flex-1 bg-transparent border-0 font-mono font-medium outline-none text-xs text-teal-300 placeholder:text-slate-700"
                        />
                        <button
                          type="submit"
                          className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold px-4 py-1.5 rounded-lg text-xs font-mono transition cursor-pointer"
                        >
                          Run Code
                        </button>
                      </form>
                    </div>

                    {/* Pre-made standard template selectors for students */}
                    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-5" id="preset_commands_card">
                      <div className="flex items-center gap-1.5 mb-3">
                        <Sparkles className="h-4 w-4 text-amber-400" />
                        <h4 className="text-sm font-semibold text-slate-100">Quick SQLite Query Presets</h4>
                      </div>
                      <p className="text-xs text-slate-400 mb-4 bg-slate-900 border border-slate-800 p-2.5 rounded-lg">
                        We loaded an interactive Python terminal with sqlite3. Try running these ready-made statements to explore statistical or spatial joins in Python:
                      </p>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" id="presets_grid">
                        {[
                          {
                            label: "List tables metadata inside SQLite system master",
                            query: "cursor.execute(\"SELECT name, sql FROM sqlite_master WHERE type='table'\").fetchall()"
                          },
                          {
                            label: "Find students with ABSENT records matching history",
                            query: "cursor.execute(\"SELECT s.name, a.date FROM students s JOIN attendance a ON s.id=a.student_id WHERE a.status='ABSENT'\").fetchall()"
                          },
                          {
                            label: "Count standard registers marked total",
                            query: "cursor.execute(\"SELECT status, COUNT(*) FROM attendance GROUP BY status\").fetchall()"
                          },
                          {
                            label: "Aggregate attendance percentage per individual student",
                            query: "import json; [ { 'name': row[0], 'rate': round((row[1]/3)*100, 1) } for row in cursor.execute(\"SELECT s.name, COUNT(CASE WHEN a.status='PRESENT' THEN 1 END) FROM students s LEFT JOIN attendance a ON s.id=a.student_id GROUP BY s.id\").fetchall() ]"
                          }
                        ].map((btn, i) => (
                          <button
                            key={i}
                            onClick={() => injectAndRunCommand(btn.query)}
                            className="bg-slate-900 hover:bg-slate-800/80 border border-slate-800 p-3 rounded-lg text-left text-xs font-mono group transition-all text-slate-300 hover:text-slate-100 flex justify-between items-start cursor-pointer"
                          >
                            <span className="flex-1 pr-3 leading-relaxed">{btn.label} <span className="text-teal-400 block mt-1.5 text-[10px] break-all">{btn.query}</span></span>
                            <ArrowRight className="h-4 w-4 shrink-0 text-slate-600 group-hover:translate-x-1 transition" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Tab 4: Concepts Center */}
                {activeTab === 'concepts' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-6"
                    id="tab_concepts"
                  >
                    {/* Concept Toggle Header */}
                    <div className="flex gap-4 border-b border-slate-800 pb-2" id="concept_toggle_tabs">
                      <button 
                        onClick={() => setSelectedConcept('tables')}
                        className={`pb-2 text-sm font-semibold border-b-2 transition ${
                          selectedConcept === 'tables' ? 'text-teal-400 border-teal-400' : 'text-slate-400 border-transparent hover:text-slate-200'
                        }`}
                      >
                        Core Concept: Relational Tables & Schema
                      </button>
                      <button 
                        onClick={() => setSelectedConcept('storage')}
                        className={`pb-2 text-sm font-semibold border-b-2 transition ${
                          selectedConcept === 'storage' ? 'text-teal-400 border-teal-400' : 'text-slate-400 border-transparent hover:text-slate-200'
                        }`}
                      >
                        Core Concept: Local Python & DB Data Storage
                      </button>
                    </div>

                    {/* Concept View: Relational Tables */}
                    {selectedConcept === 'tables' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="tables_concept_grid">
                        
                        {/* Schema block */}
                        <div className="bg-slate-950/60 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
                          <div>
                            <span className="text-[10px] font-bold text-teal-400 tracking-widest uppercase block mb-1">CONSTRUCTS</span>
                            <h3 className="text-md font-extrabold text-slate-100 flex items-center gap-1.5">
                              <Database className="h-4.5 w-4.5 text-teal-400" />
                              What is a Database Table?
                            </h3>
                            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                              Computers group structured values into <strong>Tables</strong>. A table is like a grid made of fixed <strong>Columns</strong> (defined keys with set types) and matching transactional <strong>Rows</strong> (the real variables data instances).
                            </p>
                            
                            <hr className="border-slate-800/80 my-4" />
                            
                            <h4 className="text-xs font-bold text-slate-300">Primary and Foreign Keys</h4>
                            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                              To connect separate entities securely, we use keys:
                            </p>
                            <ul className="text-xs text-slate-400 list-disc list-inside space-y-1.5 mt-2 ml-1">
                              <li><strong>Primary Key:</strong> A Column that MUST be 100% unique for each row. In our app, <code>students.id</code> is the primary key.</li>
                              <li><strong>Foreign Key:</strong> A column in a table referencing the primary key of another table. In our app, <code>attendance.student_id</code> references <code>students.id</code>, establishing a transactional link.</li>
                            </ul>
                          </div>

                          {/* Beautiful code render inside */}
                          <div className="mt-6 bg-slate-900 rounded-xl p-3.5 border border-slate-800">
                            <span className="text-[11px] font-mono text-indigo-400 block mb-2">schema.sql parsed by Python:</span>
                            <pre className="text-[10px] text-slate-300 font-mono overflow-x-auto whitespace-pre leading-relaxed">
{`CREATE TABLE students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    roll_number TEXT UNIQUE
);

CREATE TABLE attendance (
    id INTEGER PRIMARY KEY,
    student_id TEXT REFERENCES students(id),
    date TEXT,
    status TEXT
);`}
                            </pre>
                          </div>
                        </div>

                        {/* Visual Mapping block */}
                        <div className="bg-slate-950/60 border border-slate-800 p-5 rounded-2xl">
                          <span className="text-[10px] font-bold text-teal-400 tracking-widest uppercase block mb-1">MAPPING</span>
                          <h3 className="text-md font-extrabold text-slate-100">Python variables index vs SQLite</h3>
                          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                            How does Python store tables? Traditionally, list/tuple arrays or nested dictionary objects. The database compiles this natively into serialized indexes on memory disk space.
                          </p>

                          <div className="mt-4 space-y-3" id="mapping_demos">
                            <div className="bg-slate-905 bg-slate-900 border border-slate-800 rounded-lg p-3">
                              <span className="text-[10px] font-semibold text-teal-400 block">1. Standard Python Variable Array Structures (RAM)</span>
                              <pre className="text-[10px] font-mono text-slate-300 overflow-x-auto mt-2 bg-slate-950/40 p-2 rounded">
{`students_list = [
  {"id": "s1", "name": "Aria"},
  {"id": "s2", "name": "Marcus"}
]`}
                              </pre>
                              <p className="text-[9px] text-slate-500 mt-2">
                                Good for temporary manipulation, but crashes/resets on system closure.
                              </p>
                            </div>

                            <div className="bg-slate-905 bg-slate-900 border border-slate-800 rounded-lg p-3">
                              <span className="text-[10px] font-semibold text-indigo-400 block">2. SQL File Data Persistent Blocks / Indexes</span>
                              <pre className="text-[10px] font-mono text-slate-300 overflow-x-auto mt-2 bg-slate-950/40 p-2 rounded">
{`SELECT name FROM students JOIN attendance 
ON students.id=attendance.student_id;`}
                              </pre>
                              <p className="text-[9px] text-slate-500 mt-2">
                                Extremely high performance, persistent across reloads, filters millions of indices instantaneously.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Concept View: Data Storage */}
                    {selectedConcept === 'storage' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="storage_concept_grid">
                        <div className="bg-slate-950/60 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
                          <div>
                            <span className="text-[10px] font-bold text-indigo-400 tracking-widest uppercase block mb-1">DATA FLOW</span>
                            <h3 className="text-md font-extrabold text-slate-100">Where is the attendance data saved?</h3>
                            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                              Our Python execution sandbox runs directly via WebAssembly inside your browser's VM space. It creates a virtual files environment (indexedDB / memory) containing the <code>attendance_system.db</code> SQLite payload.
                            </p>
                            <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                              Every action you take (e.g. adding students, marking status indexes) changes the physical binary byte-data inside the SQLite filesystem blocks.
                            </p>
                          </div>

                          <div className="mt-6 bg-slate-900 rounded-lg p-4 border border-slate-800">
                            <span className="text-[10px] font-bold text-teal-400 tracking-wider block mb-2 font-mono">LIVE SQLite persistence export:</span>
                            <p className="text-xs text-slate-300">
                              You can extract the exact compiled SQLite databases generated by Python in this browser! Download it below to run open queries in database browsers (DBeaver, SQLite Studio):
                            </p>
                            <div className="mt-4 flex gap-2">
                              <button
                                onClick={downloadSQLiteDatabase}
                                className="bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold py-2 px-4 rounded-lg flex items-center gap-1.5 cursor-pointer shadow transition"
                              >
                                <Save className="h-4 w-4" /> Download SQLite Database File
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="bg-slate-950/60 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
                          <div>
                            <span className="text-[10px] font-bold text-indigo-400 tracking-widest uppercase block mb-1">SERIALIZE vs SQLITE</span>
                            <h3 className="text-md font-extrabold text-slate-100">Comparing Data Storage Formats</h3>
                            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                              When program engineers design software, they choose formats based on complexity. Let's compare standard options:
                            </p>

                            <div className="mt-4 space-y-4" id="format_comparison">
                              <div className="flex gap-3">
                                <span className="h-6 w-6 font-bold bg-slate-900 border border-slate-800 rounded flex justify-center items-center text-xs text-emerald-400">CSV</span>
                                <div>
                                  <p className="text-xs text-slate-200 font-bold">Comma Separated Values</p>
                                  <p className="text-[11px] text-slate-400 leading-normal">Rows partitioned by string lines, columns split by commas. Lightweight, easy to read in Excel, but unable to enforce security relations or index primary constraints natively.</p>
                                </div>
                              </div>

                              <div className="flex gap-3">
                                <span className="h-6 w-6 font-bold bg-slate-900 border border-slate-800 rounded flex justify-center items-center text-xs text-teal-400">SQL</span>
                                <div>
                                  <p className="text-xs text-slate-200 font-bold">Relational Engine (SQLite3)</p>
                                  <p className="text-[11px] text-slate-400 leading-normal">Encrypted binary relational storage mapping databases to precise byte locations. Safe cascades, keys validation, constraints block execution errors on incorrect typing.</p>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="mt-6 flex flex-col gap-2 p-3 bg-indigo-950/10 border border-indigo-900/50 rounded-lg">
                            <h4 className="text-xs font-bold text-indigo-400 flex items-center gap-1">
                              <HelpCircle className="h-4 w-4" /> Why is this better than browser LocalStorage?
                            </h4>
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                              LocalStorage only saves flat strings. SQLite lets you write multi-table JOINs, validate that students exist before tagging attendance, prevent duplicate days, and export standardized relational files.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

              </div>
            </div>

            {/* Right Column - Live Code execution track, database schemas info */}
            <div className="lg:col-span-4 flex flex-col gap-6" id="right_column">
              
              {/* SQLite live stats panel */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-5" id="live_python_logs_card">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-3 justify-between">
                  <div className="flex items-center gap-1.5">
                    <Terminal className="h-4 w-4 text-emerald-400 animate-pulse" />
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                      Python Engine Logs
                    </h3>
                  </div>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono">
                    LIVE TRACK
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
                  Every GUI button trigger translates directly to Python script compilation. Watch the live executed payload calls below:
                </p>

                <div className="bg-slate-900 rounded-lg border border-slate-800 p-3 h-44 overflow-y-auto scrollbar-thin flex flex-col-reverse gap-1.5 font-mono text-[10px] text-teal-300" id="python_actions_logs_view">
                  {pythonExecutionLogs.map((log, idx) => (
                    <div key={idx} className="whitespace-pre-wrap leading-normal border-b border-slate-800/40 pb-1 border-dotted">
                      {log}
                    </div>
                  ))}
                </div>
              </div>

              {/* SQLite Table structure metadata list view */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 flex-1 flex flex-col" id="active_schema_card">
                <div className="border-b border-slate-800 pb-3 mb-4">
                  <span className="text-[10px] font-bold text-indigo-400 tracking-widest uppercase block mb-1">active indices</span>
                  <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                    <Database className="h-4.5 w-4.5 text-indigo-400" />
                    SQLite Physical Schema Structure
                  </h3>
                </div>

                <div className="space-y-4 flex-1 overflow-y-auto max-h-[300px] scrollbar-thin" id="schemas_view">
                  {dbStats.schemas.map((sc, i) => (
                    <div key={i} className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2">
                        <span className="text-xs font-mono font-bold text-teal-300">TABLE: {sc.table}</span>
                        <span className="text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded">
                          {sc.table === 'students' ? `${students.length} rows` : `${attendance.length} rows`}
                        </span>
                      </div>
                      <pre className="text-[9px] font-mono text-slate-400 overflow-x-auto whitespace-pre leading-relaxed">
                        {sc.sql}
                      </pre>
                    </div>
                  ))}
                  
                  {dbStats.schemas.length === 0 && (
                    <div className="text-center py-6 text-xs text-slate-500">
                      Schemas loading...
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 leading-relaxed bg-slate-900/40 p-3 rounded-lg flex items-start gap-2">
                  <span className="text-teal-400 font-bold font-mono">NOTE:</span>
                  <span>
                    Our database engine persists data securely inside standard files buffers, isolating changes exclusively within your browser's private WASM container.
                  </span>
                </div>
              </div>

            </div>
          </>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950/60 py-4 px-6 text-center text-xs text-slate-500" id="footer_section">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p>© 2026 Python WASM Attendance Studio. Educating relational table architectures.</p>
          <div className="flex gap-4">
            <button onClick={() => setActiveTab('concepts')} className="hover:text-slate-300 cursor-pointer transition">Concepts Index</button>
            <span>•</span>
            <button onClick={downloadSQLiteDatabase} className="hover:text-slate-300 cursor-pointer transition">Export SQLite File</button>
            <span>•</span>
            <button onClick={downloadCSVData} className="hover:text-slate-300 cursor-pointer transition">Export CSV Reports</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
