// Entry point of the PDEStudio demo page (src/pages/software/pdestudio.astro): the example menu and the studio.
import { Studio } from './studio.js';

function main() {
  const root = document.querySelector('[data-studio]');
  if (!root) return;
  const picker = document.querySelector('[data-studio-example]');
  const launch = document.querySelector('[data-studio-launch]');
  const studio = new Studio(root, root.dataset.studio);
  const open = (name) => {
    launch.textContent = `@launch ${name}()`;
    studio.open(name);
  };
  picker.addEventListener('change', () => open(picker.value));
  document.querySelector('[data-studio-app]').hidden = false;
  open(picker.value);
}

main();
