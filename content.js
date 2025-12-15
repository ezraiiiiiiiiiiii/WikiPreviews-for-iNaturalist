(function() {
    'use strict';

    // 1. Element creation/initialization
    const wrapper = document.createElement('div');
    wrapper.className = 'wp-popup';
    wrapper.id = 'wiki-preview-popup';

    const popup = document.createElement('div');
    popup.className = 'wikipediapreview';

    popup.innerHTML = `
        <div class="wikipediapreview-content-wrapper">
            <div class="wikipediapreview-body" id="wiki-preview-body">
                <div class="wikipediapreview-body-text-content" id="wiki-text-content">
                    <p class="wikipediapreview-body-loading-text">Loading preview...</p>
                </div>
            </div>
            <div class="wikipediapreview-footer" id="wiki-footer">
                <a href="#" target="_blank" class="wikipediapreview-footer-link-cta" id="wiki-footer-link">Read full article on Wikipedia ↗</a>
            </div>
        </div>
        <div class="wikipediapreview-body-image no-image" id="wiki-body-image"></div>
    `;

    wrapper.appendChild(popup);
    document.body.appendChild(wrapper);

    const popupBody = popup.querySelector('#wiki-preview-body');
    const popupContent = popup.querySelector('#wiki-text-content');
    const popupBodyImg = popup.querySelector('#wiki-body-image');
    const popupFooter = popup.querySelector('#wiki-footer');
    const popupFooterLink = popup.querySelector('#wiki-footer-link');

    let hideTimeout = null;
    let isOverLink = false;
    let isOverPopup = false;
    let currentScientificName = null;
    let isPopupLoaded = false;
    let currentRequest = null; // Uses AbortController, initialized in fetchWikiData

    function attemptHide() {
        if (isOverLink || isOverPopup) return;
        hidePopup();
    }

    function hidePopup() {
        if (hideTimeout) clearTimeout(hideTimeout);
        wrapper.classList.remove('show');
        hideTimeout = setTimeout(() => {
            wrapper.style.display = 'none';
            currentScientificName = null;
            isPopupLoaded = false;
            popupFooter.style.display = '';
        }, 150);
    }

    function showPopup(linkRect, scientificName) {
        if (hideTimeout) clearTimeout(hideTimeout);

        wrapper.style.display = 'block';
        wrapper.style.opacity = '0';

        if (currentScientificName !== scientificName || !isPopupLoaded) {
            currentScientificName = scientificName;
            isPopupLoaded = false;

            popupBodyImg.style.backgroundImage = '';
            popupBodyImg.classList.add('no-image');
            popupContent.innerHTML = '<p class="wikipediapreview-body-loading-text">Loading preview...</p>';

            popupFooter.style.display = '';
            popupFooterLink.href = '#';
            popupFooterLink.textContent = 'Read full article on Wikipedia ↗';

            fetchWikiData(scientificName);
        }

        requestAnimationFrame(() => {
            const popupW = wrapper.offsetWidth || 550;
            const popupH = wrapper.offsetHeight || 150;
            const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
            const scrollY = window.pageYOffset || document.documentElement.scrollTop;

            const linkPageRect = {
                left: linkRect.left + scrollX,
                right: linkRect.right + scrollX,
                top: linkRect.top + scrollY,
                bottom: linkRect.bottom + scrollY,
                height: linkRect.height
            };

            let desiredLeft = linkPageRect.right + 15;

            if (linkRect.right + 15 + popupW > window.innerWidth - 10) {
                desiredLeft = linkPageRect.left - 15 - popupW;
            }

            let desiredTop = linkPageRect.top + (linkPageRect.height / 2) - (popupH / 2);

            wrapper.style.left = `${Math.round(desiredLeft)}px`;
            wrapper.style.top = `${Math.round(desiredTop)}px`;
            wrapper.classList.add('show');
            wrapper.style.opacity = '';
        });
    }

    wrapper.addEventListener('mouseenter', () => {
        isOverPopup = true;
        if (hideTimeout) clearTimeout(hideTimeout);
    });

    wrapper.addEventListener('mouseleave', () => {
        isOverPopup = false;
        setTimeout(attemptHide, 100);
    });

    // 2. Network functions using fetch
    function fetchWikiData(title) {
        if (currentRequest && currentRequest.abort) currentRequest.abort();
        currentRequest = new AbortController();
        const { signal } = currentRequest;

        const parseUrl = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text&redirects=1&formatversion=2&format=json&origin=*`;
        const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;

        let parseData = null;
        let summaryData = null;
        
        Promise.all([
            fetch(parseUrl, { signal })
                .then(r => r.ok ? r.json() : null)
                .then(data => { parseData = data; })
                .catch(e => { if (e.name !== 'AbortError') console.error("Parse fetch failed:", e); }),

            fetch(summaryUrl, { signal })
                .then(r => r.ok ? r.json() : null)
                .then(data => { summaryData = data; })
                .catch(e => { if (e.name !== 'AbortError') console.error("Summary fetch failed:", e); })

        ]).then(() => {
            if (parseData && parseData.parse) {
                renderPopup(parseData.parse, summaryData);
            } else {
                fetchWikidataFallback(title);
            }
        });
    }

    function fetchWikidataFallback(title) {
        if (currentRequest && currentRequest.abort) currentRequest.abort();
        currentRequest = new AbortController();
        const { signal } = currentRequest;

        const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(title)}&language=en&format=json&origin=*`;

        fetch(searchUrl, { signal })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data && data.search && data.search.length > 0) {
                    const entityId = data.search[0].id;
                    fetchWikidataEntity(entityId, title);
                } else {
                    renderWikispeciesFallback(title);
                }
            })
            .catch(e => {
                 if (e.name !== 'AbortError') renderWikispeciesFallback(title);
            });
    }

    function fetchWikidataEntity(entityId, originalTitle) {
        if (currentRequest && currentRequest.abort) currentRequest.abort();
        currentRequest = new AbortController();
        const { signal } = currentRequest;
        
        const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entityId}&props=labels|descriptions|claims&languages=en&format=json&origin=*`;

        fetch(entityUrl, { signal })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                const entity = data?.entities?.[entityId];
                if (entity) {
                    renderWikidataPopup(entity, entityId);
                } else {
                    renderWikispeciesFallback(originalTitle);
                }
            })
            .catch(e => {
                if (e.name !== 'AbortError') renderWikispeciesFallback(originalTitle);
            });
    }

    // 3. Rendering function (with relative link fix)
    function renderPopup(parseData, summaryData) {
        const pageTitle = parseData.title;
        const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle)}`;

        popupFooter.style.display = '';
        popupFooterLink.href = wikiUrl;
        popupFooterLink.textContent = 'Read full article on Wikipedia ↗';

        if (summaryData && summaryData.thumbnail && summaryData.thumbnail.source) {
            popupBodyImg.style.backgroundImage = `url("${summaryData.thumbnail.source}")`;
            popupBodyImg.classList.remove('no-image');
            popupBodyImg.onclick = () => window.open(wikiUrl, '_blank');
        } else {
            popupBodyImg.style.backgroundImage = '';
            popupBodyImg.classList.add('no-image');
            popupBodyImg.onclick = null;
        }

        const tempDiv = document.createElement('div');
        let wikiHtml = parseData.text; 

        wikiHtml = wikiHtml.replace(
            /(href=["'])(\/(?:wiki|\w)\/)/g,
            '$1https://en.wikipedia.org$2'
        );
        
        tempDiv.innerHTML = wikiHtml;

        const removeSelectors = '.mw-editsection, .reference, sup, .noprint, .infobox, .navbox, .vertical-navbox, .sidebar, .metadata, table';
        tempDiv.querySelectorAll(removeSelectors).forEach(el => el.remove());

        const paragraphs = tempDiv.querySelectorAll('p');
        let extractedText = '';
        let sentenceCount = 0;
        const MAX_CHARS = 350;

        paragraphLoop: for (let p of paragraphs) {
            if (sentenceCount >= 2) break;
            const text = p.innerHTML;
            if (!text.trim() || text.trim().length < 20) continue;
            const sentences = text.split(/(?<=[.!?])\s+/);

            for (let sentence of sentences) {
                if (sentenceCount >= 2) break paragraphLoop;
                const cleanSentence = sentence.replace(/\{\{.*?\}\}/g, '').trim();
                if (cleanSentence.length > 10 && !cleanSentence.match(/^(Listen|File:|Image:)/)) {
                    const testText = extractedText + (extractedText ? ' ' : '') + sentence.trim();
                    const testTextStripped = testText.replace(/<[^>]*>/g, '');
                    if (sentenceCount === 1 && testTextStripped.length > MAX_CHARS) {
                        break paragraphLoop;
                    }
                    extractedText = testText;
                    sentenceCount++;
                }
            }
        }

        if (extractedText) {
            popupContent.innerHTML = `<p>${extractedText}</p>`;
        } else {
            popupContent.innerHTML = '<p style="font-style: italic;">No summary text available.</p>';
        }

        popupBody.scrollTop = 0;
        isPopupLoaded = true;
    }

    function renderWikidataPopup(entity, entityId) {
        const wikidataUrl = `https://www.wikidata.org/wiki/${entityId}`;
        const label = entity.labels?.en?.value || 'Unknown';
        const description = entity.descriptions?.en?.value || 'No description available.';

        popupFooter.style.display = '';
        popupFooterLink.href = wikidataUrl;
        popupFooterLink.textContent = 'See more on Wikidata ↗';

        const imageClaim = entity.claims?.P18?.[0];
        if (imageClaim) {
            const imageFilename = imageClaim.mainsnak.datavalue.value;
            const imageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(imageFilename)}?width=300`;
            popupBodyImg.style.backgroundImage = `url("${imageUrl}")`;
            popupBodyImg.classList.remove('no-image');
            popupBodyImg.onclick = () => window.open(wikidataUrl, '_blank');
        } else {
            popupBodyImg.style.backgroundImage = '';
            popupBodyImg.classList.add('no-image');
            popupBodyImg.onclick = null;
        }

        popupContent.innerHTML = `<p><b>${label}</b> – ${description}</p>`;
        popupBody.scrollTop = 0;
        isPopupLoaded = true;
    }

    function renderWikispeciesFallback(title) {
        const wsUrl = `https://species.wikimedia.org/wiki/${encodeURIComponent(title)}`;

        popupBodyImg.style.backgroundImage = '';
        popupBodyImg.classList.add('no-image');
        popupFooter.style.display = 'none';

        popupContent.innerHTML = `<p>No entry for <i>${title}</i> exists on English Wikipedia or Wikidata. <a href="${wsUrl}" target="_blank">Check for an entry on Wikispecies ↗</a></p>`;

        isPopupLoaded = true;
    }

    // 4. Link creation
function createLink(scientificName, inline = false) {
    const link = document.createElement('a');
    
    link.title = ""; 
    
    link.href = `https://en.wikipedia.org/wiki/${encodeURIComponent(scientificName)}`;
    link.target = '_blank';
    link.className = 'inat-wiki-link';
    link.style.cssText = 'text-decoration: none !important; border-bottom: none !important;';
    
    const size = inline ? '1.4em' : '2.0em';
    const margin = inline ? '0em' : '0.3em';
    
    // Wikipedia icon
link.innerHTML = `<span style="display: inline-block; width: ${size}; height: ${size}; background: white; border: 1.5px solid #3366cc; border-radius: 20%; padding: 0.1em; **vertical-align: middle;** margin-left: ${margin}; line-height: 0; box-sizing: border-box;"><img src="https://upload.wikimedia.org/wikipedia/commons/5/5a/Wikipedia%27s_W.svg" style="width: 100%; height: 100%; display: block;"></span>`;
    link.addEventListener('mouseenter', (e) => {
        isOverLink = true;
        showPopup(link.getBoundingClientRect(), scientificName);
    });

    link.addEventListener('mouseleave', () => {
        isOverLink = false;
        setTimeout(attemptHide, 300);
    });

    return link;
}

function makeAnchorInline(anchor) {
    anchor.style.display = 'inline';
    anchor.style.whiteSpace = 'nowrap';
}

    function addWikipediaLinks() {
    const taxonContainers = document.querySelectorAll(
        'inat-taxon, .SplitTaxon'
    );

    taxonContainers.forEach(container => {
        // Skip if we already processed the link inside this container
        if (container.querySelector('.inat-wiki-link[data-processed="true"]')) return;

        let scientificNameText = '';

        const sciEl =
            container.querySelector('.sciname') ||
            container.querySelector('.display-name.sciname') ||
            container.querySelector('.secondary-name .sciname');

        if (sciEl) scientificNameText = sciEl.textContent.trim();
        if (!scientificNameText || scientificNameText === 'Unknown') return;

        const rankRegex = /^(Realm|Subrealm|Kingdom|Subkingdom|Phylum|Subphylum|Division|Subdivision|Class|Subclass|Superclass|Superorder|Order|Suborder|Infraorder|Superfamily|Epifamily|Family|Subfamily|Infrafamily|Tribe|Subtribe|Infratribe|Genus|Subgenus|Species|Subspecies)\s+/;
        const cleanName = scientificNameText.replace(rankRegex, '');
        if (!/^[A-Z][A-Za-z\s-]+$/.test(cleanName)) return;

        const inActivity = container.closest('.ActivityItem') !== null;
        const inGrid = container.classList.contains('title') &&
                       container.closest('.thumbnail') !== null;

        // inside createLink
        const link = createLink(cleanName, inActivity || inGrid);
        link.dataset.processed = "true";

        // Attach to existing container logic
        if (inActivity) {
            const primarySciName = container.querySelector('.sciname.display-name');
            if (primarySciName) {
                primarySciName.after(link);
            } else {
                const comname = container.querySelector('.comname');
                if (comname) comname.after(link);
                else container.appendChild(link);
            }
        } else if (inGrid) {
            const comname = container.querySelector('.display-name.comname');
            const sciname = container.querySelector('.display-name.sciname');
            if (comname) { makeAnchorInline(comname); comname.after(link); }
            else if (sciname) { makeAnchorInline(sciname); sciname.after(link); }
            else container.appendChild(link);
        } else if (container.classList.contains('SplitTaxon')) {
            const sciEl = container.querySelector('.sciname.display-name');
            if (sciEl) {
                sciEl.after(link);
            } else {
                container.appendChild(link);
            }
        } else {
            container.appendChild(link);
        }
    });
}

    function init() {
        addWikipediaLinks();

        let debounceTimeout = null;
        const observer = new MutationObserver((mutations) => {
            let hasAdditions = false;
            for (let m of mutations) {
                if (m.addedNodes.length > 0) { hasAdditions = true; break; }
            }
            if (hasAdditions) {
                if (debounceTimeout) clearTimeout(debounceTimeout);
                debounceTimeout = setTimeout(addWikipediaLinks, 300);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
