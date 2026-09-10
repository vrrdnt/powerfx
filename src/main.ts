import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import './style.css';
import { EditorView, basicSetup } from './workspace';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header><a href="https://vrrdnt.dev">vrrdnt.dev</a><span>/ powerfx</span><a href="https://github.com/vrrdnt/powerfx">Source ↗</a></header>
  <main><div class="heading"><h1>Power Fx <span>& Flow</span></h1><p>A little structure goes a long way.</p></div>
  <section class="workspace"><div class="editor-label">SOURCE <span>Power Apps</span></div><div id="source"></div></section></main>`;
new EditorView({ doc: 'With({total:Sum(cart,price*quantity)},If(total>100,Notify("Discount applied",NotificationType.Success),Notify("Standard pricing",NotificationType.Information)))', extensions: basicSetup, parent: document.querySelector('#source')! });
