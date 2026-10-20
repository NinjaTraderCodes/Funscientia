/** A short "Discovery!" card that slides in at the top and fades away. */
export function toast(title: string, text: string, ms = 4200): void {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<strong dir="auto"></strong><span dir="auto"></span>`;
  el.querySelector('strong')!.textContent = title;
  el.querySelector('span')!.textContent = text;
  document.getElementById('app')!.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  window.setTimeout(() => {
    el.classList.remove('show');
    window.setTimeout(() => el.remove(), 400);
  }, ms);
}
