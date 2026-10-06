import { isPdfFile, type SharedFile } from './sheets';
import { nameResult, textResults, normalizeSearch, type SearchResult } from './search';
import { searchPdfIndex } from './pdf-search';
export interface SearchOptions {
  files(): Promise<SharedFile[]>;
  current?: SharedFile;
  open(result: SearchResult): void | Promise<void>;
}
export function showSearchDialog(options: SearchOptions): () => void {
  const dialog = document.createElement('dialog'); dialog.className = 'sheet-dialog search-dialog';
  dialog.setAttribute('aria-label', 'Search songs');
  dialog.innerHTML = `<button class="dialog-close icon-button" aria-label="Close search">×</button><h2>Search songs</h2><form><label>Search text<input class="search-query" type="search" maxlength="160" required enterkeyhint="search" dir="auto" placeholder="Song, artist or file name"></label><fieldset><legend>Search in</legend><label><input type="radio" name="scope" value="all">All files</label><label><input type="radio" name="scope" value="current">Current file</label></fieldset><button class="primary" type="submit">Search</button><button class="secondary search-stop" type="button" hidden>Stop</button></form><p>Searches file names and readable PDF text. Image-only pages have no searchable text. The first search downloads PDFs; later searches reuse a local text cache.</p><p class="search-status" role="status"></p><div class="search-results"></div>`;
  document.body.append(dialog); dialog.showModal();
  let alive = true, run = 0, opening = false, controller: AbortController | undefined;
  const query = dialog.querySelector<HTMLInputElement>('.search-query')!, status = dialog.querySelector<HTMLElement>('.search-status')!, list = dialog.querySelector<HTMLElement>('.search-results')!, stop = dialog.querySelector<HTMLButtonElement>('.search-stop')!;
  const scopeCurrent = dialog.querySelector<HTMLInputElement>('[value=current]')!, scopeAll = dialog.querySelector<HTMLInputElement>('[value=all]')!;
  scopeCurrent.disabled = !options.current; scopeAll.checked = true;
  const close = () => { if (!alive) return; alive = false; controller?.abort(); dialog.close(); dialog.remove(); };
  dialog.querySelector<HTMLButtonElement>('.dialog-close')!.onclick = close; dialog.addEventListener('close', close);
  const cancel = () => { controller?.abort(); run++; stop.hidden = true; status.textContent = 'Search stopped. Results found so far are shown.'; };
  stop.onclick = cancel;
  query.addEventListener('input', () => { controller?.abort(); run++; stop.hidden = true; list.replaceChildren(); status.textContent = ''; });
  dialog.querySelectorAll<HTMLInputElement>('[name=scope]').forEach(input => input.onchange = () => { cancel(); list.replaceChildren(); status.textContent = ''; });
  dialog.querySelector<HTMLFormElement>('form')!.onsubmit = async event => {
    event.preventDefault(); if (opening) return;
    const term = query.value.trim(); if (!normalizeSearch(term)) { status.textContent = 'Enter a song, artist or file name.'; return; }
    query.blur(); // Dismiss the mobile keyboard for both Enter and the Search button.
    controller?.abort(); controller = new AbortController(); const signal = controller.signal, revision = ++run;
    list.replaceChildren(); stop.hidden = false; status.textContent = 'Loading files...';
    const live = () => alive && revision === run && !signal.aborted;
    let count = 0, failed = 0;
    const add = (results: SearchResult[]) => {
      if (!live()) return;
      const batch = document.createDocumentFragment();
      for (const result of results) {
        count++; const button = document.createElement('button'); button.className = 'secondary search-result';
        const title = document.createElement('strong'); title.dir = 'auto'; title.textContent = `${result.file.title} | ${result.kind === 'name' ? 'File name' : `Page ${result.location.page}`}`;
        const snippet = document.createElement('span'); snippet.dir = 'auto'; snippet.textContent = result.snippet;
        button.append(title, snippet);
        button.onclick = async () => {
          if (opening) return; opening = true; controller?.abort(); stop.hidden = true;
          list.querySelectorAll('button').forEach(element => element.disabled = true);
          try { await options.open(result); if (alive) close(); }
          catch (error) { if (alive) status.textContent = error instanceof Error ? error.message : 'Could not open result.'; }
          finally { opening = false; if (alive) list.querySelectorAll('button').forEach(element => element.disabled = false); }
        };
        batch.append(button);
      }
      list.append(batch);
    };
    try {
      const files = scopeCurrent.checked && options.current ? [options.current] : await options.files();
      if (!live()) return;
      // Names appear immediately, before PDF downloads/extraction.
      files.forEach(file => add(nameResult(file, term)));
      for (const [index, file] of files.entries()) {
        if (!live()) return;
        if (!isPdfFile(file)) continue;
        try {
          status.textContent = `Searching ${index + 1}/${files.length}: ${file.title} (${count} results)`;
          const blocks = await searchPdfIndex(file.pdfUrl, signal, (page, total) => { if (live()) status.textContent = `Searching ${file.title}: page ${page}/${total} (${count} results)`; });
          add(textResults(file, blocks, term));
        } catch (error) {
          if (!live()) return; failed++;
          const note = document.createElement('p'); note.className = 'search-error'; note.textContent = `Could not search PDF text in ${file.title}. Its name results are still available.`; list.append(note);
        }
      }
      if (live()) status.textContent = `${count} result${count === 1 ? '' : 's'}${failed ? `; ${failed} PDF(s) could not be searched` : ''}.`;
    } catch (error) { if (live()) status.textContent = error instanceof Error ? error.message : 'Search failed.'; }
    finally { if (alive && revision === run) stop.hidden = true; }
  };
  query.focus({ preventScroll: true }); return close;
}
