/**
 * PII Discovery — frontend controller.
 */

(() => {
    'use strict';

    const SCAN_ENDPOINT = '/api/scan';

    const ANCHOR_FIELDS = ['name', 'email', 'phone', 'aadhaar', 'pan'];

    let elements = {};

    let selectedFiles = [];

    document.addEventListener('DOMContentLoaded', initializeEventListeners);

    // --------------------------------------------------------------------
    // Setup
    // --------------------------------------------------------------------

    let scanButtonDefaultHTML = '';

    function initializeEventListeners() {
        elements = {
            form: document.getElementById('scan-form'),
            resetButton: document.getElementById('reset-button'),
            scanButton: document.getElementById('scan-button'),
            fileInput: document.getElementById('file-input'),
            folderInput: document.getElementById('folder-input'),
            fileInputLabel: document.querySelector('label[for="file-input"]'),
            folderInputLabel: document.querySelector('label[for="folder-input"]'),
            dropZone: document.getElementById('drop-zone'),
            selectedFilesList: document.getElementById('selected-files-list'),
            progressSection: document.getElementById('progress-section'),
            statusMessage: document.getElementById('status-message'),
            resultsSection: document.getElementById('results-section'),
            successBanner: document.getElementById('scan-success-banner'),
            errorSection: document.getElementById('error-section'),
            errorMessage: document.getElementById('error-message'),
            scanSummaryContent: document.getElementById('scan-summary-content'),
            scanStatisticsContent: document.getElementById('scan-statistics-content'),
            filesWithPiiList: document.getElementById('files-with-pii-list'),
            detectedEntitiesContent: document.getElementById('detected-entities-content'),
        };

        scanButtonDefaultHTML = elements.scanButton.innerHTML;

        elements.form.addEventListener('submit', handleScanSubmit);
        elements.resetButton.addEventListener('click', handleReset);

        elements.fileInput.addEventListener('change', (event) => {
            const files = Array.from(event.target.files).map((file) => ({
                file,
                relativePath: file.name,
            }));
            setSelectedFiles(files);
        });

        elements.folderInput.addEventListener('change', (event) => {
            const files = Array.from(event.target.files).map((file) => ({
                file,
                relativePath: file.webkitRelativePath || file.name,
            }));
            setSelectedFiles(files);
        });

        elements.dropZone.addEventListener('click', () => elements.fileInput.click());
        elements.dropZone.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                elements.fileInput.click();
            }
        });

        elements.dropZone.addEventListener('dragover', (event) => {
            event.preventDefault();
            elements.dropZone.classList.add('is-dragover');
        });
        elements.dropZone.addEventListener('dragleave', () => {
            elements.dropZone.classList.remove('is-dragover');
        });
        elements.dropZone.addEventListener('drop', handleDrop);
    }

    // --------------------------------------------------------------------
    // File selection (single / multiple / folder / drag-and-drop)
    // --------------------------------------------------------------------

    async function handleDrop(event) {
        event.preventDefault();
        elements.dropZone.classList.remove('is-dragover');

        const items = event.dataTransfer ? Array.from(event.dataTransfer.items) : [];
        const entries = items
            .map((item) => (item.webkitGetAsEntry ? item.webkitGetAsEntry() : null))
            .filter(Boolean);

        let dropped;
        if (entries.length > 0) {
            const nested = await Promise.all(entries.map((entry) => readEntry(entry, '')));
            dropped = nested.flat();
        } else {
            dropped = Array.from(event.dataTransfer.files).map((file) => ({
                file,
                relativePath: file.name,
            }));
        }

        setSelectedFiles(dropped);
    }

    function readEntry(entry, basePath) {
        if (entry.isFile) {
            return new Promise((resolve, reject) => {
                entry.file(
                    (file) => resolve([{ file, relativePath: `${basePath}${entry.name}` }]),
                    reject
                );
            });
        }

        if (entry.isDirectory) {
            const reader = entry.createReader();
            return readAllDirectoryEntries(reader).then((childEntries) =>
                Promise.all(
                    childEntries.map((child) => readEntry(child, `${basePath}${entry.name}/`))
                ).then((nested) => nested.flat())
            );
        }

        return Promise.resolve([]);
    }

    function readAllDirectoryEntries(reader) {
        return new Promise((resolve, reject) => {
            const allEntries = [];
            const readNextBatch = () => {
                reader.readEntries((batch) => {
                    if (batch.length === 0) {
                        resolve(allEntries);
                        return;
                    }
                    allEntries.push(...batch);
                    readNextBatch();
                }, reject);
            };
            readNextBatch();
        });
    }

    function setSelectedFiles(files) {
        selectedFiles = files;
        renderSelectedFiles();
    }

    function renderSelectedFiles() {
        elements.selectedFilesList.innerHTML = '';
        selectedFiles.forEach(({ relativePath, file }, index) => {
            const item = document.createElement('li');

            const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            icon.setAttribute('class', 'file-icon');
            icon.setAttribute('viewBox', '0 0 24 24');
            icon.setAttribute('fill', 'none');
            icon.setAttribute('stroke', 'currentColor');
            icon.setAttribute('stroke-width', '1.75');
            icon.setAttribute('stroke-linecap', 'round');
            icon.setAttribute('stroke-linejoin', 'round');
            icon.setAttribute('aria-hidden', 'true');
            icon.innerHTML = '<path d="M7 3.5h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z"/><path d="M14 3.5V8h4.5"/>';

            const info = document.createElement('div');
            info.className = 'file-info';

            const nameEl = document.createElement('span');
            nameEl.className = 'file-name';
            nameEl.textContent = relativePath;
            nameEl.title = relativePath;

            const sizeEl = document.createElement('span');
            sizeEl.className = 'file-size';
            sizeEl.textContent = formatFileSize(file.size);

            info.append(nameEl, sizeEl);

            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'file-remove-button';
            removeButton.setAttribute('aria-label', `Remove ${relativePath}`);
            removeButton.innerHTML =
                '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
                'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                '<path d="M6 6l12 12M18 6 6 18"/></svg>';
            removeButton.addEventListener('click', () => removeSelectedFile(index));

            item.append(icon, info, removeButton);
            elements.selectedFilesList.appendChild(item);
        });
    }

    function removeSelectedFile(index) {
        setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    // --------------------------------------------------------------------
    // Form handling
    // --------------------------------------------------------------------

    function collectAnchors() {
        const anchors = {};
        ANCHOR_FIELDS.forEach((field) => {
            const input = document.getElementById(`anchor-${field}`);
            anchors[field] = input.value.trim();
        });
        return anchors;
    }

    function validateInputs(anchors) {
        const hasAnchor = Object.values(anchors).some((value) => value.length > 0);
        if (!hasAnchor) {
            return 'Please provide at least one identifier (name, email, phone, Aadhaar, or PAN).';
        }
        if (selectedFiles.length === 0) {
            return 'Please select at least one file or folder to scan.';
        }
        return null;
    }

    function buildFormData(anchors) {
        const formData = new FormData();

        selectedFiles.forEach(({ file, relativePath }) => {
            formData.append('files', file, relativePath);
        });

        ANCHOR_FIELDS.forEach((field) => {
            if (anchors[field]) {
                formData.append(field, anchors[field]);
            }
        });

        return formData;
    }

    // --------------------------------------------------------------------
    // Network
    // --------------------------------------------------------------------

    async function uploadFiles(formData) {
        const response = await fetch(SCAN_ENDPOINT, {
            method: 'POST',
            body: formData,
        });

        const body = await response.json().catch(() => null);
        return { ok: response.ok, body };
    }

    function extractErrorMessage(body) {
        if (!body) return 'Something went wrong while scanning. Please try again.';
        if (body.detail && typeof body.detail === 'object' && body.detail.message) {
            return body.detail.message;
        }
        if (typeof body.detail === 'string') return body.detail;
        if (body.message) return body.message;
        return 'Something went wrong while scanning. Please try again.';
    }

    async function handleScanSubmit(event) {
        event.preventDefault();

        const anchors = collectAnchors();
        const validationError = validateInputs(anchors);

        clearResults();

        if (validationError) {
            showError(validationError);
            return;
        }

        const formData = buildFormData(anchors);

        showLoading('Scanning uploaded files for PII…');
        setControlsDisabled(true);

        try {
            const { ok, body } = await uploadFiles(formData);

            if (!ok || !body || body.success === false) {
                showError(extractErrorMessage(body));
                return;
            }

            renderResults(body.data);
        } catch (error) {
            showError('Could not reach the server. Please check your connection and try again.');
        } finally {
            hideLoading();
            setControlsDisabled(false);
        }
    }

    function setControlsDisabled(disabled) {
        elements.scanButton.disabled = disabled;
        elements.resetButton.disabled = disabled;
        elements.fileInput.disabled = disabled;
        elements.folderInput.disabled = disabled;
        elements.fileInputLabel.classList.toggle('is-disabled', disabled);
        elements.folderInputLabel.classList.toggle('is-disabled', disabled);
        elements.dropZone.classList.toggle('is-disabled', disabled);
        elements.dropZone.setAttribute('aria-disabled', String(disabled));
        elements.dropZone.tabIndex = disabled ? -1 : 0;

        elements.scanButton.innerHTML = disabled
            ? '<span class="button-spinner" aria-hidden="true"></span> Scanning…'
            : scanButtonDefaultHTML;
    }

    // --------------------------------------------------------------------
    // Loading state
    // --------------------------------------------------------------------

    function showLoading(message) {
        elements.statusMessage.textContent = message;
        elements.progressSection.hidden = false;
        elements.progressSection.classList.add('fade-in');
    }

    function hideLoading() {
        elements.progressSection.hidden = true;
    }

    // --------------------------------------------------------------------
    // Results rendering
    // --------------------------------------------------------------------

    function renderResults(data) {
        renderSummary(data.summary);
        renderStatistics(data.summary);
        renderFiles(data.files);
        renderEntities(data.files);
        elements.successBanner.hidden = data.summary.total_entities !== 0;
        elements.resultsSection.hidden = false;
        elements.resultsSection.classList.add('fade-in');
    }

    function renderSummary(summary) {
        elements.scanSummaryContent.innerHTML = '';
        elements.scanSummaryContent.append(
            createCard('Files Scanned', summary.files_scanned, 'card-accent'),
            createCard(
                'Files With PII',
                summary.files_with_pii,
                summary.files_with_pii > 0 ? 'card-danger' : 'card-success'
            )
        );
    }

    function renderStatistics(summary) {
        elements.scanStatisticsContent.innerHTML = '';
        elements.scanStatisticsContent.append(
            createCard('Total PII Entities', summary.total_entities, 'card-accent')
        );
    }

    function createCard(label, value, modifierClass) {
        const card = document.createElement('div');
        card.className = ['card', modifierClass].filter(Boolean).join(' ');

        const labelEl = document.createElement('span');
        labelEl.className = 'card-label';
        labelEl.textContent = label;

        const valueEl = document.createElement('span');
        valueEl.className = 'card-value';
        valueEl.textContent = String(value);

        card.append(labelEl, valueEl);
        return card;
    }

    function renderFiles(files) {
        elements.filesWithPiiList.innerHTML = '';

        files
            .filter((file) => file.entities.length > 0)
            .forEach((file) => {
                const item = document.createElement('li');

                const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                icon.setAttribute('class', 'icon');
                icon.setAttribute('viewBox', '0 0 24 24');
                icon.setAttribute('fill', 'none');
                icon.setAttribute('stroke', 'currentColor');
                icon.setAttribute('stroke-width', '2');
                icon.setAttribute('stroke-linecap', 'round');
                icon.setAttribute('stroke-linejoin', 'round');
                icon.setAttribute('aria-hidden', 'true');
                icon.innerHTML = '<path d="M12 3.5 21 19H3L12 3.5z"/><path d="M12 9.5v4.25"/><path d="M12 16.75h.01"/>';

                const nameEl = document.createElement('span');
                nameEl.className = 'file-list-name';
                nameEl.textContent = file.filename;
                nameEl.title = file.filename;

                const countEl = document.createElement('span');
                countEl.className = 'badge';
                const count = file.entities.length;
                countEl.textContent = `${count} ${count === 1 ? 'entity' : 'entities'}`;

                item.append(icon, nameEl, countEl);
                elements.filesWithPiiList.appendChild(item);
            });
    }

    function renderEntities(files) {
        elements.detectedEntitiesContent.innerHTML = '';

        const rows = files.flatMap((file) =>
            file.entities.map((entity) => ({ filename: file.filename, ...entity }))
        );

        if (rows.length === 0) {
            elements.detectedEntitiesContent.appendChild(
                createEmptyState('No PII entities were detected.')
            );
            return;
        }

        const table = document.createElement('table');
        table.className = 'pii-table';

        const thead = document.createElement('thead');
        thead.innerHTML =
            '<tr><th scope="col">File</th><th scope="col">Type</th>' +
            '<th scope="col">Value</th><th scope="col">Context</th><th scope="col">Score</th></tr>';

        const tbody = document.createElement('tbody');
        rows.forEach((row) => {
            const tr = document.createElement('tr');
            tr.append(
                createCell(row.filename),
                createBadgeCell(row.type),
                createCell(row.value),
                createCell(row.context),
                createScoreCell(row.score)
            );
            tbody.appendChild(tr);
        });

        table.append(thead, tbody);

        const scrollWrapper = document.createElement('div');
        scrollWrapper.className = 'table-scroll';
        scrollWrapper.appendChild(table);
        elements.detectedEntitiesContent.appendChild(scrollWrapper);
    }

    function createEmptyState(message) {
        const wrapper = document.createElement('div');
        wrapper.className = 'empty-state';
        wrapper.innerHTML =
            '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ' +
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M7 3.5h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z"/>' +
            '<path d="M14 3.5V8h4.5"/><path d="M9 13h6M9 16.5h6"/></svg>';
        const text = document.createElement('p');
        text.textContent = message;
        wrapper.appendChild(text);
        return wrapper;
    }

    function createCell(text) {
        const td = document.createElement('td');
        td.textContent = text ?? '';
        return td;
    }

    function createScoreCell(score) {
        const td = document.createElement('td');
        if (typeof score !== 'number') {
            td.textContent = score ?? '';
            return td;
        }

        const pill = document.createElement('span');
        const level = score >= 0.8 ? 'high' : score >= 0.5 ? 'medium' : 'low';
        pill.className = `score-pill score-${level}`;
        pill.textContent = score.toFixed(2);
        td.appendChild(pill);
        return td;
    }

    function createBadgeCell(type) {
        const td = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = type;
        td.appendChild(badge);
        return td;
    }

    // --------------------------------------------------------------------
    // Error / reset
    // --------------------------------------------------------------------

    function showError(message) {
        elements.errorMessage.textContent = message;
        elements.errorSection.hidden = false;
        elements.errorSection.classList.add('fade-in');
    }

    function clearResults() {
        elements.resultsSection.hidden = true;
        elements.successBanner.hidden = true;
        elements.errorSection.hidden = true;
        elements.errorMessage.textContent = '';
        elements.scanSummaryContent.innerHTML = '';
        elements.scanStatisticsContent.innerHTML = '';
        elements.filesWithPiiList.innerHTML = '';
        elements.detectedEntitiesContent.innerHTML = '';
    }

    function handleReset() {
        setSelectedFiles([]);
        elements.fileInput.value = '';
        elements.folderInput.value = '';
        clearResults();
        hideLoading();
    }
})();
