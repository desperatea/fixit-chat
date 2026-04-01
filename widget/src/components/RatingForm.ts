interface RatingFormOptions {
  primaryColor: string;
  onRate: (rating: number) => void;
}

export class RatingForm {
  private el: HTMLDivElement;

  constructor(private options: RatingFormOptions) {
    this.el = document.createElement('div');
    this.el.className = 'fixit-rating';
    this.el.innerHTML = `
      <div class="fixit-rating-title">Оцените качество поддержки</div>
      <div class="fixit-rating-stars">
        ${[1, 2, 3, 4, 5]
          .map(
            (n) => `<button class="fixit-star" data-rating="${n}" aria-label="${n} звёзд">★</button>`,
          )
          .join('')}
      </div>
      <div class="fixit-rating-thanks" style="display:none">Спасибо за оценку!</div>
    `;

    this.bindEvents();
  }

  render(): HTMLDivElement {
    return this.el;
  }

  private bindEvents(): void {
    const stars = this.el.querySelectorAll('.fixit-star');
    stars.forEach((star) => {
      star.addEventListener('mouseenter', () => {
        const rating = parseInt((star as HTMLElement).dataset.rating || '0');
        this.highlight(rating);
      });

      star.addEventListener('mouseleave', () => {
        this.highlight(0);
      });

      star.addEventListener('click', () => {
        const rating = parseInt((star as HTMLElement).dataset.rating || '0');
        this.options.onRate(rating);
        this.showThanks();
      });
    });
  }

  private highlight(upTo: number): void {
    const stars = this.el.querySelectorAll('.fixit-star');
    stars.forEach((star, i) => {
      (star as HTMLElement).style.color = i < upTo ? this.options.primaryColor : '#ccc';
    });
  }

  private showThanks(): void {
    const starsDiv = this.el.querySelector('.fixit-rating-stars') as HTMLDivElement;
    const thanksDiv = this.el.querySelector('.fixit-rating-thanks') as HTMLDivElement;
    if (starsDiv) starsDiv.style.display = 'none';
    if (thanksDiv) thanksDiv.style.display = 'block';
  }
}
