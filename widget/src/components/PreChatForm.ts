import type { FormField } from '../types';

interface PreChatFormOptions {
  fields: FormField[];
  privacyPolicyUrl: string | null;
  primaryColor: string;
  onSubmit: (data: Record<string, string>) => void;
}

export class PreChatForm {
  private el: HTMLDivElement;

  constructor(private options: PreChatFormOptions) {
    this.el = document.createElement('div');
    this.el.className = 'fixit-prechat';
    this.el.innerHTML = this.buildHTML();
    this.bindEvents();
  }

  render(): HTMLDivElement {
    return this.el;
  }

  showError(msg: string): void {
    const err = this.el.querySelector('.fixit-form-error') as HTMLDivElement;
    if (err) {
      err.textContent = msg;
      err.style.display = 'block';
    }
  }

  setLoading(loading: boolean): void {
    const btn = this.el.querySelector('.fixit-form-submit') as HTMLButtonElement;
    if (btn) {
      btn.disabled = loading;
      btn.textContent = loading ? 'Отправка...' : 'Начать чат';
    }
  }

  private buildHTML(): string {
    const fields = this.options.fields
      .map((f) => {
        const req = f.required ? 'required' : '';
        const asterisk = f.required ? ' <span class="fixit-required">*</span>' : '';

        if (f.type === 'textarea') {
          return `
            <div class="fixit-field">
              <label for="fixit-${f.name}">${f.label}${asterisk}</label>
              <textarea id="fixit-${f.name}" name="${f.name}" rows="3"
                placeholder="${f.label}" ${req}></textarea>
            </div>`;
        }
        if (f.name === 'visitor_phone') {
          return `
            <div class="fixit-field">
              <label for="fixit-${f.name}">${f.label}${asterisk}</label>
              <input type="tel" id="fixit-${f.name}" name="${f.name}"
                placeholder="+7 8634 441160" ${req} />
            </div>`;
        }
        return `
          <div class="fixit-field">
            <label for="fixit-${f.name}">${f.label}${asterisk}</label>
            <input type="${f.type}" id="fixit-${f.name}" name="${f.name}"
              placeholder="${f.label}" ${req} />
          </div>`;
      })
      .join('');

    const privacyLink = this.options.privacyPolicyUrl
      ? `<a href="${this.options.privacyPolicyUrl}" target="_blank" rel="noopener">
          политикой конфиденциальности</a>`
      : 'политикой конфиденциальности';

    return `
      <form class="fixit-form" novalidate>
        ${fields}
        <div class="fixit-field fixit-consent">
          <label>
            <input type="checkbox" name="consent" required />
            Я согласен(а) с обработкой персональных данных и ${privacyLink}
          </label>
        </div>
        <div class="fixit-form-error" style="display:none"></div>
        <button type="submit" class="fixit-form-submit"
          style="background-color: ${this.options.primaryColor}">
          Начать чат
        </button>
      </form>`;
  }

  private bindEvents(): void {
    const form = this.el.querySelector('form')!;

    // Phone mask: +7 XXXX XXXXXX
    const phoneInput = form.querySelector('#fixit-visitor_phone') as HTMLInputElement | null;
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

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const formData = new FormData(form);
      const data: Record<string, string> = {};

      // Validate required fields
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

      // Check consent
      const consent = form.querySelector('input[name="consent"]') as HTMLInputElement;
      if (!consent.checked) {
        this.showError('Необходимо согласие на обработку данных');
        return;
      }

      this.options.onSubmit(data);
    });
  }
}
