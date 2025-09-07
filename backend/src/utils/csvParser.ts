export interface CategoryCSVRow {
  Parent: string;
  Child: string;
  Type?: string;
  Hidden?: string;
  Savings?: string;
  Description?: string;
}

export interface ParsedCategory {
  parent: string | null;
  name: string;
  isHidden: boolean;
  isSavings: boolean;
  description?: string;
}

export interface CSVParseResult {
  success: boolean;
  categories?: ParsedCategory[];
  error?: string;
  rowErrors?: { row: number; error: string }[];
}

export function parseCSVContent(content: string): CSVParseResult {
  try {
    const lines = content.trim().split('\n');
    
    if (lines.length < 2) {
      return {
        success: false,
        error: 'CSV file must have a header row and at least one data row'
      };
    }

    // Parse header
    const headerLine = lines[0];
    const headers = parseCSVLine(headerLine).map(h => h.trim());
    
    // Validate required headers
    const requiredHeaders = ['Parent', 'Child'];
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    
    if (missingHeaders.length > 0) {
      return {
        success: false,
        error: `Missing required headers: ${missingHeaders.join(', ')}`
      };
    }

    // Get header indices
    const headerIndices: Record<string, number> = {};
    headers.forEach((header, index) => {
      headerIndices[header] = index;
    });

    // Parse data rows
    const categories: ParsedCategory[] = [];
    const rowErrors: { row: number; error: string }[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines

      const values = parseCSVLine(line);
      
      try {
        const parent = values[headerIndices['Parent']]?.trim() || '';
        const child = values[headerIndices['Child']]?.trim() || '';
        // Type field is reserved for future use
        // const type = values[headerIndices['Type']]?.trim()?.toLowerCase() || '';
        const hidden = values[headerIndices['Hidden']]?.trim()?.toLowerCase() || '';
        const savings = values[headerIndices['Savings']]?.trim()?.toLowerCase() || '';
        const description = values[headerIndices['Description']]?.trim() || '';

        // Validate row
        if (!child) {
          rowErrors.push({ row: i + 1, error: 'Child (category name) is required' });
          continue;
        }

        // Parse boolean values
        const isHidden = ['yes', 'true', '1', 'y'].includes(hidden);
        const isSavings = ['yes', 'true', '1', 'y'].includes(savings);

        categories.push({
          parent: parent || null,
          name: child,
          isHidden,
          isSavings,
          description: description || undefined
        });
      } catch (error) {
        rowErrors.push({ 
          row: i + 1, 
          error: error instanceof Error ? error.message : 'Invalid row format' 
        });
      }
    }

    if (rowErrors.length > 0) {
      return {
        success: false,
        error: 'Some rows could not be parsed',
        rowErrors
      };
    }

    if (categories.length === 0) {
      return {
        success: false,
        error: 'No valid categories found in CSV'
      };
    }

    return {
      success: true,
      categories
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse CSV'
    };
  }
}

/**
 * Parse a single CSV line, handling quoted values and commas within quotes
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next character
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add last field
  result.push(current);
  
  return result;
}