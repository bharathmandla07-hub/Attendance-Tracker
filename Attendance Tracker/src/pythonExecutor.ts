import { Student, AttendanceRecord, AttendanceStatus } from './types';

interface ExecContext {
  students: Student[];
  attendance: AttendanceRecord[];
  currentDate: string; // YYYY-MM-DD
  output: string[];
  variables: Record<string, any>;
}

// Simple unique ID generator
const generateId = () => Math.random().toString(36).substring(2, 9);

// Parse Python function arguments representing named or positional arguments.
// Examples: 'name="Alice Smith", roll_number="Roll-01"' or '"Bob Jones", "Roll-02", "bob@gmail.com"'
function parseArgs(argsStr: string, context: ExecContext): Record<string, string> {
  const result: Record<string, string> = {};
  
  // Quick tokenization by comma but respecting strings inside quotes
  const argList: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';
  
  for (let i = 0; i < argsStr.length; i++) {
    const char = argsStr[i];
    if ((char === '"' || char === "'") && (i === 0 || argsStr[i - 1] !== '\\')) {
      if (inQuotes && char === quoteChar) {
        inQuotes = false;
      } else if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      }
      current += char;
    } else if (char === ',' && !inQuotes) {
      argList.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    argList.push(current.trim());
  }

  // Map each argument to positional index or named keys
  // For positional, we can support order: name, roll_number, email, notes
  const positionalKeys = ['name', 'roll_number', 'email', 'notes', 'status'];
  
  argList.forEach((arg, index) => {
    // Check if named argument, like: name="Alice"
    const equalsIdx = arg.indexOf('=');
    if (equalsIdx !== -1 && !isQuoted(arg.substring(0, equalsIdx))) {
      const key = arg.substring(0, equalsIdx).trim();
      let val = arg.substring(equalsIdx + 1).trim();
      val = unwrapValue(val, context);
      result[key] = val;
    } else {
      // Positional
      const key = positionalKeys[index] || `param_${index}`;
      const val = unwrapValue(arg, context);
      result[key] = val;
    }
  });

  return result;
}

// Helper to check if a string is a variable name or a quoted string literal
function isQuoted(str: string): boolean {
  str = str.trim();
  return (str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"));
}

// Help resolve values from environment variables or literals
function unwrapValue(val: string, context: ExecContext): any {
  val = val.trim();
  if (isQuoted(val)) {
    return val.substring(1, val.length - 1);
  }
  if (val === 'True' || val === 'true') return true;
  if (val === 'False' || val === 'false') return false;
  if (val === 'None' || val === 'null') return '';
  
  // Check if it's a defined variable
  if (val in context.variables) {
    return context.variables[val];
  }
  
  return val;
}

// Execute a single line of python code
function executeLine(line: string, context: ExecContext): void {
  line = line.trim();
  if (!line || line.startsWith('#')) return;

  // Handle print()
  if (line.startsWith('print(') && line.endsWith(')')) {
    const printContent = line.substring(6, line.length - 1).trim();
    // check if printContent is a concatenated values or variable
    if (isQuoted(printContent)) {
      context.output.push(unwrapValue(printContent, context));
    } else if (printContent in context.variables) {
      const val = context.variables[printContent];
      context.output.push(typeof val === 'object' ? JSON.stringify(val) : String(val));
    } else if (printContent.includes('+')) {
      const parts = printContent.split('+').map(p => unwrapValue(p.trim(), context));
      context.output.push(parts.join(''));
    } else {
      // Evaluate custom terms or print directly
      context.output.push(unwrapValue(printContent, context));
    }
    return;
  }

  // Handle variable assignments: my_list = ["Alice", "Bob"]
  const equalsIdx = line.indexOf('=');
  
  // Ensure we don't treat double equals == as variable assignment or named function params
  const isAssignment = equalsIdx !== -1 && 
                       line[equalsIdx + 1] !== '=' && 
                       line[equalsIdx - 1] !== '=' && 
                       line[equalsIdx - 1] !== '<' && 
                       line[equalsIdx - 1] !== '>';

  if (isAssignment) {
    const varName = line.substring(0, equalsIdx).trim();
    const varValue = line.substring(equalsIdx + 1).trim();
    
    // Check if it's a list literal, e.g., ["Alice", "Bob"]
    if (varValue.startsWith('[') && varValue.endsWith(']')) {
      const content = varValue.substring(1, varValue.length - 1).trim();
      if (!content) {
        context.variables[varName] = [];
      } else {
        // Simple comma split respecting strings
        const items: any[] = [];
        let cur = '';
        let inQ = false;
        let qChar = '';
        for (let i = 0; i < content.length; i++) {
          const c = content[i];
          if ((c === '"' || c === "'") && (i === 0 || content[i-1] !== '\\')) {
            if (inQ && c === qChar) inQ = false;
            else if (!inQ) { inQ = true; qChar = c; }
            cur += c;
          } else if (c === ',' && !inQ) {
            items.push(unwrapValue(cur, context));
            cur = '';
          } else {
            cur += c;
          }
        }
        if (cur.trim()) {
          items.push(unwrapValue(cur, context));
        }
        context.variables[varName] = items;
      }
    } else {
      context.variables[varName] = unwrapValue(varValue, context);
    }
    return;
  }

  // Handle db methods
  if (line.startsWith('db.')) {
    const dotIdx = line.indexOf('.');
    const parenIdx = line.indexOf('(');
    if (parenIdx === -1 || !line.endsWith(')')) {
      context.output.push(`Error name: SyntaxError: invalid method syntax at "${line}"`);
      return;
    }
    const methodName = line.substring(dotIdx + 1, parenIdx).trim();
    const argsStr = line.substring(parenIdx + 1, line.length - 1).trim();
    const parsedArgs = parseArgs(argsStr, context);

    if (methodName === 'help') {
      context.output.push('--- Available python database APIs ---');
      context.output.push('db.add_student(name, roll_number, email="", notes="")');
      context.output.push('db.mark_attendance(name_or_roll, status, notes="")');
      context.output.push('db.remove_student(roll_number_or_name)');
      context.output.push('db.clear_database()');
      context.output.push('db.print_summary()');
      context.output.push('db.info()');
      context.output.push('--------------------------------------');
    } else if (methodName === 'info') {
      context.output.push('--- Database diagnostics ---');
      context.output.push(`Total Students: ${context.students.length}`);
      context.output.push(`Total Marks: ${context.attendance.length}`);
      context.output.push(`Current Date Focus: ${context.currentDate}`);
      context.output.push('---------------------------');
    } else if (methodName === 'add_student') {
      const name = parsedArgs['name'] || parsedArgs['param_0'];
      const rollNumber = parsedArgs['roll_number'] || parsedArgs['param_1'] || `Roll-${Math.floor(100 + Math.random() * 900)}`;
      const email = parsedArgs['email'] || parsedArgs['param_2'] || `${(name || 'student').toLowerCase().replace(/\s+/g, '')}@school.edu`;
      const notes = parsedArgs['notes'] || parsedArgs['param_3'] || '';

      if (!name) {
        context.output.push('Error ValueError: Student "name" argument is required.');
        return;
      }

      // Check if student with roll_number exists
      const duplicate = context.students.find(s => s.rollNumber.toLowerCase() === rollNumber.toLowerCase());
      if (duplicate) {
        context.output.push(`Warning: Roll Number "${rollNumber}" already exists. Student "${duplicate.name}" is already registered.`);
        return;
      }

      const newStudent: Student = {
        id: generateId(),
        name,
        email,
        rollNumber,
        isActive: true,
        notes,
        createdAt: new Date().toISOString()
      };
      context.students.push(newStudent);
      context.output.push(`Added Student: ${name} [Roll: ${rollNumber}] successfully.`);
    } else if (methodName === 'mark_attendance') {
      const identifier = parsedArgs['name_or_roll'] || parsedArgs['student_name'] || parsedArgs['name'] || parsedArgs['param_0'];
      const statusInput = (parsedArgs['status'] || parsedArgs['param_1'] || 'PRESENT').toUpperCase();
      const notes = parsedArgs['notes'] || parsedArgs['param_2'] || '';

      if (!identifier) {
        context.output.push('Error ValueError: "student_name" or "roll_number" is required for marking attendance.');
        return;
      }

      // Enforce correct status values
      const validStatuses: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];
      if (!validStatuses.includes(statusInput as AttendanceStatus)) {
        context.output.push(`Error ValueError: "${statusInput}" is not a valid status. Choose from PRESENT, ABSENT, LATE, EXCUSED.`);
        return;
      }

      const student = context.students.find(
        s => s.name.toLowerCase() === identifier.toLowerCase() || s.rollNumber.toLowerCase() === identifier.toLowerCase()
      );

      if (!student) {
        context.output.push(`Error: Student "${identifier}" not found in database directory. Run db.add_student() first.`);
        return;
      }

      // Record ID is unique for each student and date combination
      const date = context.currentDate;
      const recordId = `${student.id}_${date}`;
      
      const recordIndex = context.attendance.findIndex(r => r.id === recordId);
      const newRecord: AttendanceRecord = {
        id: recordId,
        studentId: student.id,
        date,
        status: statusInput as AttendanceStatus,
        notes,
        markedAt: new Date().toISOString()
      };

      if (recordIndex !== -1) {
        context.attendance[recordIndex] = newRecord; // Update
        context.output.push(`Updated Attendance for ${student.name} on ${date} to: ${statusInput}`);
      } else {
        context.attendance.push(newRecord); // Add
        context.output.push(`Marked Attendance for ${student.name} on ${date} to: ${statusInput}`);
      }
    } else if (methodName === 'remove_student') {
      const identifier = parsedArgs['roll_number_or_name'] || parsedArgs['param_0'];
      if (!identifier) {
        context.output.push('Error ValueError: Student identifier is required for deletion.');
        return;
      }

      const initialLength = context.students.length;
      context.students = context.students.filter(
        s => s.name.toLowerCase() !== identifier.toLowerCase() && s.rollNumber.toLowerCase() !== identifier.toLowerCase()
      );

      if (context.students.length < initialLength) {
        context.output.push(`Success: Student with matching identifier "${identifier}" is successfully removed from records.`);
      } else {
        context.output.push(`Error: No students found matching identifier "${identifier}".`);
      }
    } else if (methodName === 'clear_database') {
      context.students = [];
      context.attendance = [];
      context.output.push('Database reset successfully. Empty database list.');
    } else if (methodName === 'print_summary') {
      context.output.push(`========== ATTENDANCE REPORT (${context.currentDate}) ==========`);
      const formatHeader = (col1: string, col2: string, col3: string, col4: string) => {
        return `| ${col1.padEnd(10)} | ${col2.padEnd(20)} | ${col3.padEnd(10)} | ${col4.padEnd(15)} |`;
      };
      
      context.output.push(formatHeader('Roll No', 'Student Name', 'Status', 'Marked Date'));
      context.output.push('|' + '-'.repeat(12) + '|' + '-'.repeat(22) + '|' + '-'.repeat(12) + '|' + '-'.repeat(17) + '|');
      
      if (context.students.length === 0) {
        context.output.push('| No students in directory. Database is empty.                     |');
      } else {
        context.students.forEach(s => {
          const rec = context.attendance.find(r => r.studentId === s.id && r.date === context.currentDate);
          const status = rec ? rec.status : 'UNMARKED';
          context.output.push(formatHeader(s.rollNumber, s.name, status, context.currentDate));
        });
      }
      context.output.push('='.repeat(65));
    } else {
      context.output.push(`Error AttributeError: Database 'db' has no method attribute '${methodName}'`);
    }
    return;
  }

  context.output.push(`>>> ${line}`);
}

// Parses and executes a Python block of lines (handles simple loops and standard lines)
export function executePythonBlock(
  code: string,
  initialStudents: Student[],
  initialAttendance: AttendanceRecord[],
  currentDate: string
): { success: boolean; output: string[]; students: Student[]; attendance: AttendanceRecord[] } {
  
  const context: ExecContext = {
    students: JSON.parse(JSON.stringify(initialStudents)),
    attendance: JSON.parse(JSON.stringify(initialAttendance)),
    currentDate,
    output: [],
    variables: {}
  };

  try {
    const lines = code.split('\n');
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip blank spaces and comments
      if (!trimmed || trimmed.startsWith('#')) {
        i++;
        continue;
      }

      // Simple for-loop implementation: `for name in ["Alice", "Bob", "Charlie"]:` or `for x in my_list:`
      const forMatch = trimmed.match(/^for\s+(\w+)\s+in\s+(.+)\s*:/);
      if (forMatch) {
        const loopVar = forMatch[1];
        const loopCollectionExpr = forMatch[2].trim();
        
        let loopCollection: any[] = [];
        if (loopCollectionExpr.startsWith('[') && loopCollectionExpr.endsWith(']')) {
          // Inline list parsing
          const values = loopCollectionExpr.substring(1, loopCollectionExpr.length - 1).split(',');
          loopCollection = values.map(v => unwrapValue(v.trim(), context));
        } else if (loopCollectionExpr in context.variables) {
          // From variables
          const variableVal = context.variables[loopCollectionExpr];
          if (Array.isArray(variableVal)) {
            loopCollection = variableVal;
          }
        }

        // Gather block lines (lines with indentation greater than standard or the start)
        const blockLines: string[] = [];
        i++;
        while (i < lines.length) {
          const subLine = lines[i];
          if (!subLine.trim()) {
            i++;
            continue;
          }
          // Python indentation - usually starts with spaces/tabs
          const matchWhitespace = subLine.match(/^(\s+)/);
          if (matchWhitespace && matchWhitespace[1].length > 0) {
            blockLines.push(subLine);
            i++;
          } else {
            // End of block
            break;
          }
        }

        // Run loop blocks
        loopCollection.forEach(item => {
          context.variables[loopVar] = item;
          blockLines.forEach(bLine => {
            // Replace local variable token replacements inside the functions
            let parsedBlockLine = bLine.trim();
            // Process the line under the variable frame
            executeLine(parsedBlockLine, context);
          });
        });

        // Clean up loopVar
        delete context.variables[loopVar];
        continue;
      }

      // Standard line execute
      executeLine(trimmed, context);
      i++;
    }

    return {
      success: true,
      output: context.output,
      students: context.students,
      attendance: context.attendance
    };
  } catch (err: any) {
    return {
      success: false,
      output: [...context.output, `Fatal Python Error: ${err?.message || err}`],
      students: initialStudents,
      attendance: initialAttendance
    };
  }
}
