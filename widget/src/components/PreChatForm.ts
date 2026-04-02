import type { FormField } from '../types';

interface PreChatFormOptions {
  fields: FormField[];
  privacyPolicyUrl: string | null;
  primaryColor: string;
  onSubmit: (data: Record<string, string>) => void;
}

export class PreChatForm {
  private el: HTMLDivElement;
  private form: HTMLFormElement;
  private errorEl: HTMLDivElement;
  private submitBtn: HTMLButtonElement;

  constructor(private options: PreChatFormOptions) {
    this.el = document.createElement('div');
    this.el.className = 'fixit-prechat';

    this.form = document.createElement('form');
    this.form.className = 'fixit-form';
    this.form.noValidate = true;

    // Build fields via DOM API (no innerHTML with user data)
    for (const f of options.fields) {
      const fieldDiv = document.createElement('div');
      fieldDiv.className = 'fixit-field';

      const label = document.createElement('label');
      label.setAttribute('for', `fixit-${f.name}`);
      label.textContent = f.label;
      if (f.required) {
        const asterisk = document.createElement('span');
        asterisk.className = 'fixit-required';
        asterisk.textContent = ' *';
        label.appendChild(asterisk);
      }
      fieldDiv.appendChild(label);

      if (f.type === 'textarea') {
        const textarea = document.createElement('textarea');
        textarea.id = `fixit-${f.name}`;
        textarea.name = f.name;
        textarea.rows = 3;
        textarea.placeholder = f.label;
        if (f.required) textarea.required = true;
        fieldDiv.appendChild(textarea);
      } else {
        const input = document.createElement('input');
        input.id = `fixit-${f.name}`;
        input.name = f.name;
        input.type = f.name === 'visitor_phone' ? 'tel' : f.type;
        input.placeholder = f.name === 'visitor_phone' ? '+7 8634 441160' : f.label;
        if (f.required) input.required = true;
        fieldDiv.appendChild(input);
      }

      this.form.appendChild(fieldDiv);
    }

    // Consent checkbox
    const consentDiv = document.createElement('div');
    consentDiv.className = 'fixit-field fixit-consent';
    const consentLabel = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'consent';
    checkbox.required = true;
    consentLabel.appendChild(checkbox);

    const consentText = document.createTextNode(' Я согласен(а) с обработкой персональных данных и ');
    consentLabel.appendChild(consentText);

    if (options.privacyPolicyUrl && options.privacyPolicyUrl.match(/^https?:\/\//)) {
      const link = document.createElement('a');
      link.href = options.privacyPolicyUrl;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'политикой конфиденциальности';
      consentLabel.appendChild(link);
    } else {
      consentLabel.appendChild(document.createTextNode('политикой конфиденциальности'));
    }

    consentDiv.appendChild(consentLabel);
    this.form.appendChild(consentDiv);

    // Error
    this.errorEl = document.createElement('div');
    this.errorEl.className = 'fixit-form-error';
    this.errorEl.style.display = 'none';
    this.form.appendChild(this.errorEl);

    // Submit button
    this.submitBtn = document.createElement('button');
    this.submitBtn.type = 'submit';
    this.submitBtn.className = 'fixit-form-submit';
    this.submitBtn.style.backgroundColor = options.primaryColor;
    this.submitBtn.textContent = 'Начать чат';
    this.form.appendChild(this.submitBtn);

    this.el.appendChild(this.form);
    this.bindEvents();
  }

  render(): HTMLDivElement {
    return this.el;
  }

  showError(msg: string): void {
    this.errorEl.textContent = msg;
    this.errorEl.style.display = 'block';
  }

  setLoading(loading: boolean): void {
    this.submitBtn.disabled = loading;
    this.submitBtn.textContent = loading ? 'Отправка...' : 'Начать чат';
  }

  private bindEvents(): void {
    // Phone mask: +7 XXXX XXXXXX
    const phoneInput = this.form.querySelector('#fixit-visitor_phone') as HTMLInputElement | null;
    if (phoneInput) {
      phoneInput.addEventListener('focus', () => {
        if (!phoneInput.value) phoneInput.value = '+7 ';
      });
      phoneInput.addEventListener('input', () => {
        const digits = phoneInput.value.replace(/\D/g, '').slice(0, 11);
        if (digits.length <= 1) {
          phoneInput.value = '+7 ';
        } else if (digits.length <= 5) {
          phoneInput.value = `+7 ${digits.slice(1)}`;
        } else {
          phoneInput.value = `+7 ${digits.slice(1, 5)} ${digits.slice(5)}`;
        }
      });
      phoneInput.addEventListener('blur', () => {
        if (phoneInput.value.replace(/\D/g, '').length <= 1) phoneInput.value = '';
      });
      phoneInput.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && phoneInput.value.replace(/\D/g, '').length <= 1) {
          e.preventDefault();
        }
      });
    }

    this.form.addEventListener('submit', (e) => {
      e.preventDefault();

      const formData = new FormData(this.form);
      const data: Record<string, string> = {};

      for (const field of this.options.fields) {
        const value = (formData.get(field.name) as string)?.trim() || '';
        if (field.required && !value) {
          this.showError(`Заполните поле "${field.label}"`);
          return;
        }
        if (value) {
          if (field.name === 'visitor_phone') {
            data[field.name] = '+' + value.replace(/\D/g, '');
          } else {
            data[field.name] = value;
          }
        }
      }

      const consent = this.form.querySelector('input[name="consent"]') as HTMLInputElement;
      if (!consent.checked) {
        this.showError('Необходимо согласие на обработку данных');
        return;
      }

      this.options.onSubmit(data);
    });
  }
}
