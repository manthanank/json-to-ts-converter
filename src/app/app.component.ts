import {
  Component,
  signal,
  computed,
  effect,
  inject,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TrackService } from './services/track.service';
import { Visit } from './models/visit.model';

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  title = 'json-to-ts-converter';

  // State signals
  jsonInput = signal<string>('');
  tsOutput = signal<string>('');
  inputHasError = signal<boolean>(false);
  inputErrorMessage = signal<string>('');
  copySuccess = signal<boolean>(false);
  useInterfaces = signal<boolean>(true);
  useOptionalFields = signal<boolean>(false);
  darkMode = signal<boolean>(false);

  private trackService = inject(TrackService);

  // Visitor count state
  visitorCount = signal<number>(0);
  isVisitorCountLoading = signal<boolean>(false);
  visitorCountError = signal<string | null>(null);

  // Derived state
  canConvert = computed(
    () => !this.inputHasError() && this.jsonInput().trim().length > 0
  );

  canCopyOrDownload = computed(() => this.tsOutput().trim().length > 0);

  private generatedInterfaces = new Map<string, string>();

  constructor() {
    // Auto-validate JSON input when it changes
    effect(() => {
      const input = this.jsonInput();
      this.validateJsonInput();
    });

    // Apply dark mode changes
    effect(() => {
      if (this.darkMode()) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    });
  }

  ngOnInit(): void {
    this.trackVisit();
    this.initializeDarkMode();
  }

  private initializeDarkMode(): void {
    // Check for user preference in localStorage
    const savedMode = localStorage.getItem('darkMode');
    if (savedMode) {
      this.darkMode.set(savedMode === 'true');
    } else {
      // Check for system preference
      const prefersDark = window.matchMedia(
        '(prefers-color-scheme: dark)'
      ).matches;
      this.darkMode.set(prefersDark);
    }
  }

  toggleDarkMode(): void {
    this.darkMode.update((current) => {
      const newValue = !current;
      localStorage.setItem('darkMode', newValue.toString());
      return newValue;
    });
  }

  validateJsonInput(): void {
    if (!this.jsonInput().trim()) {
      this.inputHasError.set(false);
      this.inputErrorMessage.set('');
      return;
    }

    try {
      JSON.parse(this.jsonInput());
      this.inputHasError.set(false);
      this.inputErrorMessage.set('');
    } catch (error) {
      this.inputHasError.set(true);
      this.inputErrorMessage.set(
        `Invalid JSON: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  onJsonInputChange(value: string): void {
    this.jsonInput.set(value);
  }

  clearInput(): void {
    this.jsonInput.set('');
    this.tsOutput.set('');
    this.inputHasError.set(false);
    this.inputErrorMessage.set('');
  }

  loadSampleJson(): void {
    this.jsonInput.set(`{
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "active": true,
    "lastLogin": "2025-03-30T12:00:00Z",
    "address": {
      "street": "123 Main St",
      "city": "Anytown",
      "zip": "12345"
    },
    "roles": ["admin", "user"],
    "settings": {
      "notifications": true,
      "theme": "dark"
    },
    "tags": [
      {"id": 1, "name": "important"},
      {"id": 2, "name": "personal"}
    ],
    "misc": [1, "test", true]
  }
}`);
  }

  toggleUseInterfaces(): void {
    this.useInterfaces.update((value) => !value);
  }

  toggleUseOptionalFields(): void {
    this.useOptionalFields.update((value) => !value);
  }

  convertJsonToTs() {
    try {
      this.generatedInterfaces.clear();
      const parsedJson = JSON.parse(this.jsonInput());
      this.generateInterface('Root', parsedJson);

      // Combine all generated interfaces
      let finalOutput = '';
      this.generatedInterfaces.forEach((interfaceText) => {
        finalOutput += interfaceText + '\n\n';
      });
      this.tsOutput.set(finalOutput.trim());
    } catch (error) {
      this.tsOutput.set(
        `Error: ${
          error instanceof Error ? error.message : 'Invalid JSON input'
        }`
      );
    }
  }

  copyToClipboard(): void {
    navigator.clipboard.writeText(this.tsOutput()).then(() => {
      this.copySuccess.set(true);
      setTimeout(() => this.copySuccess.set(false), 2000);
    });
  }

  downloadAsFile(): void {
    const blob = new Blob([this.tsOutput()], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'types.ts';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  private trackVisit(): void {
    this.isVisitorCountLoading.set(true);
    this.visitorCountError.set(null);

    this.trackService.trackProjectVisit(this.title).subscribe({
      next: (response: Visit) => {
        this.visitorCount.set(response.uniqueVisitors);
        this.isVisitorCountLoading.set(false);
      },
      error: (err: Error) => {
        console.error('Failed to track visit:', err);
        this.visitorCountError.set('Failed to load visitor count');
        this.isVisitorCountLoading.set(false);
      },
    });
  }

  private generateInterface(interfaceName: string, obj: any): string {
    // Handle null or primitive values
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      return this.getType(obj);
    }

    // Ensure unique interface names
    const uniqueName = this.getUniqueInterfaceName(interfaceName);

    const declarationType = this.useInterfaces() ? 'interface' : 'type';
    let result = `export ${declarationType} ${uniqueName} ${
      this.useInterfaces() ? '{\n' : '= {\n'
    }`;

    // Get all keys to detect optional fields
    const keys = Object.keys(obj);

    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const propertyType = this.getType(
          obj[key],
          this.capitalizeAndSingularize(key)
        );
        const optionalMarker = this.useOptionalFields() ? '?' : '';
        result += `  ${this.formatPropertyName(
          key
        )}${optionalMarker}: ${propertyType};\n`;
      }
    }

    result += '}';

    if (!this.useInterfaces()) {
      result += ';';
    }

    this.generatedInterfaces.set(uniqueName, result);
    return uniqueName;
  }

  private getType(value: any, suggestedName: string = 'Item'): string {
    if (value === null) {
      return 'null';
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return 'any[]';
      }

      // Check if all items are of the same type
      const sampleTypes = value.slice(0, 10).map((item) => typeof item);
      const uniqueTypes = new Set(sampleTypes);

      if (uniqueTypes.size === 1) {
        const type = Array.from(uniqueTypes)[0];
        if (type === 'object' && value[0] !== null) {
          // Handle array of objects
          const itemInterfaceName = this.generateInterface(
            suggestedName,
            value[0]
          );
          return `${itemInterfaceName}[]`;
        } else {
          return `${this.getPrimitiveType(value[0])}[]`;
        }
      } else {
        // Try to create a union type for simpler mixed arrays
        if (uniqueTypes.size <= 3) {
          const types = value.map((item) => this.getPrimitiveType(item));
          const uniqueTypeSet = new Set(types);
          return `(${Array.from(uniqueTypeSet).join(' | ')})[]`;
        }
        // Fall back to any[] for complex mixed types
        return 'any[]';
      }
    } else if (typeof value === 'object' && value !== null) {
      return this.generateInterface(suggestedName, value);
    } else {
      return this.getPrimitiveType(value);
    }
  }

  private getPrimitiveType(value: any): string {
    if (value === null) return 'null';

    const type = typeof value;
    if (type === 'string') {
      // Check if it's a date string
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        return 'Date';
      }
      return 'string';
    }

    if (type === 'number') return 'number';
    if (type === 'boolean') return 'boolean';

    return 'any';
  }

  private formatPropertyName(key: string): string {
    // Handle keys that aren't valid identifiers
    if (/^[0-9]/.test(key) || /[^a-zA-Z0-9_]/.test(key)) {
      return `'${key}'`;
    }
    return key;
  }

  private capitalizeAndSingularize(str: string): string {
    // Improved singularization
    let singular = str;
    if (str.endsWith('ies')) {
      singular = str.slice(0, -3) + 'y';
    } else if (str.endsWith('es')) {
      singular = str.slice(0, -2);
    } else if (str.endsWith('s') && !str.endsWith('ss')) {
      singular = str.slice(0, -1);
    }
    return this.capitalize(singular);
  }

  private capitalize(str: string): string {
    if (!str) return 'Item';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private getUniqueInterfaceName(baseName: string): string {
    let name = baseName;
    let counter = 1;

    while (this.generatedInterfaces.has(name)) {
      name = `${baseName}${counter}`;
      counter++;
    }

    return name;
  }
}
