document.addEventListener('DOMContentLoaded', () => {
    const solveBtn = document.getElementById('solveBtn');
    const hintBtn = document.getElementById('hintBtn');
    const pasteEndBtn = document.getElementById('pasteEndBtn');
    const pasteInput = document.getElementById('pasteInput');
    const extractedContent = document.getElementById('extractedContent');
    const apiResponse = document.getElementById('apiResponse');
    const finalStatus = document.getElementById('finalStatus');
    const stagesContainer = document.querySelector('.stages');
    const hintSection = document.querySelector('.hint-section');
    const hintResponse = document.getElementById('hintResponse');
    const pasteFeedback = document.getElementById('pasteFeedback');
    const feedbackMessage = document.getElementById('feedbackMessage');

    // New fullscreen hint elements
    const fullscreenHintOverlay = document.getElementById('fullscreenHintOverlay');
    const fullscreenHintContent = document.getElementById('fullscreenHintContent');
    const closeFullscreenBtn = document.getElementById('closeFullscreenBtn');

    // Load stored state on popup open
    const loadStoredState = () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentUrl = tabs[0]?.url || '';
            const currentPageIdentifier = getPageIdentifier(currentUrl);
            
            // Only load state if we have a valid URL
            if (currentPageIdentifier) {
                chrome.storage.local.get([currentPageIdentifier], (result) => {
                    const storedState = result[currentPageIdentifier];
                    
                    if (storedState) {
                        // Restore paste input
                        if (storedState.pasteInput) {
                            pasteInput.value = storedState.pasteInput;
                        }
                        
                        // Restore hint section
                        if (storedState.hintVisible && storedState.hintContent) {
                            hintSection.style.display = 'block';
                            hintResponse.textContent = storedState.hintContent;
                        } else {
                            hintSection.style.display = 'none';
                        }
                        
                        // Restore stages section
                        if (storedState.stagesVisible) {
                            stagesContainer.classList.add('visible');
                            
                            if (storedState.extractedContent) {
                                extractedContent.textContent = storedState.extractedContent;
                            }
                            
                            if (storedState.apiResponse) {
                                apiResponse.textContent = storedState.apiResponse;
                            }
                            
                            if (storedState.finalStatus) {
                                finalStatus.textContent = storedState.finalStatus;
                            }
                        } else {
                            stagesContainer.classList.remove('visible');
                        }
                    } else {
                        // No stored state for this page, initialize empty
                        resetPopupState();
                    }
                });
            } else {
                // No valid URL, reset popup
                resetPopupState();
            }
        });
    };

    // Save current state when content changes
    const saveState = () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentUrl = tabs[0]?.url || '';
            const currentPageIdentifier = getPageIdentifier(currentUrl);
            
            // Only save if we have a valid URL
            if (currentPageIdentifier) {
                const state = {
                    pasteInput: pasteInput.value,
                    hintVisible: hintSection.style.display === 'block',
                    hintContent: hintResponse.textContent,
                    stagesVisible: stagesContainer.classList.contains('visible'),
                    extractedContent: extractedContent.textContent,
                    apiResponse: apiResponse.textContent,
                    finalStatus: finalStatus.textContent,
                    timestamp: Date.now() // Add timestamp for potential cleanup later
                };
                
                // Store using the page identifier as the key
                const stateObj = {};
                stateObj[currentPageIdentifier] = state;
                chrome.storage.local.set(stateObj);
            }
        });
    };

    // Get a unique identifier for the current page
    // This creates a more specific identifier than just the URL
    const getPageIdentifier = (url) => {
        if (!url) return null;
        
        try {
            const urlObj = new URL(url);
            // Create a unique key based on hostname, pathname and any identifiers in the query string
            // This ensures different problems/assignments get different storage
            const pathKey = urlObj.pathname.replace(/\//g, '_');
            
            // If there are query parameters that identify the specific problem, include those
            const problemId = urlObj.searchParams.get('problem') || 
                              urlObj.searchParams.get('id') || 
                              urlObj.searchParams.get('assignment');
            
            // Combine hostname and path for a unique identifier
            let pageKey = `page_${urlObj.hostname}${pathKey}`;
            
            // If there's a problem ID, make the key even more specific
            if (problemId) {
                pageKey += `_${problemId}`;
            }
            
            return pageKey;
        } catch (e) {
            console.error('Error parsing URL:', e);
            // Fallback - use the whole URL as a key, but sanitize it
            return 'page_' + url.replace(/[^a-z0-9]/gi, '_').substring(0, 100);
        }
    };

    // Reset popup to initial state
    const resetPopupState = () => {
        pasteInput.value = '';
        hintSection.style.display = 'none';
        stagesContainer.classList.remove('visible');
        extractedContent.textContent = '';
        apiResponse.textContent = '';
        finalStatus.textContent = '';
    };

    // Function to show paste feedback
    const showPasteFeedback = (message, isSuccess) => {
        feedbackMessage.textContent = message;
        
        // First remove any existing classes
        pasteFeedback.classList.remove('success', 'error');
        
        // Update icon and add appropriate class
        const iconElement = pasteFeedback.querySelector('i');
        if (isSuccess) {
            pasteFeedback.classList.add('success');
            iconElement.className = 'fas fa-check-circle';
        } else {
            pasteFeedback.classList.add('error');
            iconElement.className = 'fas fa-exclamation-circle';
        }
        
        // Show feedback
        pasteFeedback.style.display = 'flex';
        
        // Hide feedback after 3 seconds
        setTimeout(() => {
            pasteFeedback.style.display = 'none';
        }, 3000);
    };

    const injectContent = async (tab, content) => {
        return chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (solution) => {
                try {
                    const editors = document.querySelectorAll('.ace_editor');
                    for (const editor of editors) {
                        if (editor.id && window.ace) {
                            const aceEditor = window.ace.edit(editor.id);
                            if (aceEditor && typeof aceEditor.setValue === 'function') {
                                // Move cursor to end and insert the new content
                                aceEditor.navigateFileEnd();
                                aceEditor.insert('\n\n' + solution);
                                aceEditor.clearSelection();
                                return true;
                            }
                        }
                    }
                    
                    // Fallback method if ace editor not found
                    const editorArea = document.querySelector('.ace_text-input');
                    if (editorArea) {
                        const currentContent = editorArea.value || '';
                        
                        // Only append if there's existing content
                        if (currentContent && currentContent.trim().length > 0) {
                            const newContent = currentContent + '\n\n' + solution;
                            
                            // Try to use the proper way to update the Ace editor content
                            const event = new InputEvent('input', { bubbles: true });
                            editorArea.value = newContent;
                            editorArea.dispatchEvent(event);
                        } else {
                            editorArea.value = solution;
                            const event = new InputEvent('input', { bubbles: true });
                            editorArea.dispatchEvent(event);
                        }
                        return true;
                    }
                    
                    throw new Error('No injection method worked');
                } catch (e) {
                    console.error('Injection error:', e);
                    return false;
                }
            },
            args: [content]
        });
    };

    // Show fullscreen hint view
    const showFullscreenHint = (content) => {
        fullscreenHintContent.textContent = content;
        fullscreenHintOverlay.style.display = 'flex';
        document.body.style.overflow = 'hidden'; // Prevent scrolling when fullscreen is active
    };

    // Close fullscreen hint view
    closeFullscreenBtn.addEventListener('click', () => {
        fullscreenHintOverlay.style.display = 'none';
        document.body.style.overflow = 'auto';
    });

    // Close overlay when clicking outside the content
    fullscreenHintOverlay.addEventListener('click', (e) => {
        if (e.target.id === 'fullscreenHintOverlay') {
            fullscreenHintOverlay.style.display = 'none';
        }
    });

    // Initialize expand button functionality
    const expandButton = document.querySelector('.expand-btn');
    expandButton.addEventListener('click', () => {
        const hintContent = document.getElementById('hintResponse').innerHTML;
        document.getElementById('fullscreenHintContent').innerHTML = hintContent;
        document.getElementById('fullscreenHintOverlay').style.display = 'flex';
    });

    // Function to move cursor to end of editor - enhanced for document end
    const moveCursorToEnd = async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) return;
            
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    try {
                        // Function to get the last line number of a document
                        const getLastLineNumber = (editor) => {
                            if (editor && editor.session) {
                                return editor.session.getLength() - 1;
                            }
                            return 0;
                        };

                        // Force end of document for the Ace editor
                        const forceEndOfDocument = (editor) => {
                            if (!editor) return false;
                            
                            try {
                                // Get document length
                                const lastLineNum = getLastLineNumber(editor);
                                const lastLineLength = editor.session.getLine(lastLineNum).length;
                                
                                // Position cursor at the very end of the last line
                                editor.gotoLine(lastLineNum + 1, lastLineLength, true);
                                editor.focus();
                                
                                // Alternative method: first go to last line then to end
                                setTimeout(() => {
                                    editor.navigateFileEnd();
                                    editor.focus();
                                }, 50);
                                
                                return true;
                            } catch (e) {
                                console.error("Force end error:", e);
                                return false;
                            }
                        };

                        // Approach 1: Standard Ace Editor with enhanced positioning
                        const aceEditors = document.querySelectorAll('.ace_editor');
                        for (const editor of aceEditors) {
                            if (window.ace) {
                                try {
                                    const aceEditor = window.ace.edit(editor.id || editor);
                                    if (aceEditor) {
                                        // Use our enhanced end of document function
                                        if (forceEndOfDocument(aceEditor)) {
                                            console.log('Success: Placed cursor at document end');
                                            return true;
                                        }
                                    }
                                } catch (e) {
                                    console.log('Failed enhanced Ace approach:', e);
                                }
                            }
                        }
                        
                        // Approach 2: VPL specific with complete document navigation
                        const vplFiles = document.querySelectorAll('.vpl_ide_file');
                        for (const file of vplFiles) {
                            if (window.ace) {
                                try {
                                    const aceEditor = window.ace.edit(file.id || file);
                                    // Use enhanced method
                                    if (forceEndOfDocument(aceEditor)) {
                                        console.log('Success: VPL file cursor at document end');
                                        return true;
                                    }
                                } catch (e) {
                                    console.log('Failed VPL enhanced approach:', e);
                                }
                            }
                        }

                        // Approach 3: Global ACE with aggressive positioning
                        if (window.ace) {
                            // Look for any ace editor instance
                            const editorInstances = Object.keys(window)
                                .filter(key => typeof window[key] === 'object' && window[key] && window[key].session)
                                .map(key => window[key]);
                            
                            for (const editor of editorInstances) {
                                try {
                                    if (editor && typeof editor.navigateFileEnd === 'function') {
                                        // Use the enhanced method
                                        if (forceEndOfDocument(editor)) {
                                            console.log('Success: Global editor cursor at document end');
                                            return true;
                                        }
                                    }
                                } catch (e) {
                                    console.log('Failed global editor enhanced approach:', e);
                                }
                            }
                        }
                        
                        // Approach 4: Aggressive keyboard simulation
                        const editorInput = document.querySelector('.ace_text-input');
                        if (editorInput) {
                            try {
                                editorInput.focus();
                                
                                // Simulate Ctrl+End to go to end of document
                                const ctrlEndEvent = new KeyboardEvent('keydown', {
                                    key: 'End',
                                    code: 'End',
                                    keyCode: 35,
                                    which: 35,
                                    ctrlKey: true,
                                    bubbles: true
                                });
                                editorInput.dispatchEvent(ctrlEndEvent);
                                
                                // Fallback - hit End key multiple times and down arrow
                                setTimeout(() => {
                                    // Press End key
                                    const endEvent = new KeyboardEvent('keydown', {
                                        key: 'End',
                                        code: 'End',
                                        keyCode: 35,
                                        which: 35,
                                        bubbles: true
                                    });
                                    
                                    // Press multiple times to ensure we get to end
                                    for (let i = 0; i < 3; i++) {
                                        editorInput.dispatchEvent(endEvent);
                                    }
                                    
                                    console.log('Success: Simulated End key sequence for document end');
                                }, 100);
                                
                                return true;
                            } catch (e) {
                                console.log('Failed keyboard simulation:', e);
                            }
                        }
                        
                        console.log('No successful method found to move cursor to document end');
                        return false;
                    } catch (e) {
                        console.error('Move cursor to document end error:', e);
                        return false;
                    }
                }
            });
        } catch (error) {
            console.error('Move cursor to end error:', error);
        }
    };

    // Load stored state when popup opens
    loadStoredState();
    
    // Move cursor to end of editor when popup opens
    moveCursorToEnd();
    
    // Add a listener for when input changes to save state
    pasteInput.addEventListener('input', saveState);
    
    // Add button functionality
    hintBtn.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) throw new Error('No active tab found');

            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    try {
                        const textLayers = document.querySelectorAll('.ace_text-layer');
                        if (textLayers.length > 0) {
                            let content = '';
                            for (const layer of textLayers) {
                                const lines = Array.from(layer.querySelectorAll('.ace_line'));
                                content = lines.map(line => line.textContent).join('\n');
                            }
                            if (content) return content;
                        }

                        const editorElement = document.querySelector('.vpl_ide_file.ace_editor');
                        if (editorElement && window.ace) {
                            const aceId = editorElement.id;
                            const editor = window.ace.edit(aceId);
                            return editor.getValue();
                        }

                        const editorContent = document.querySelector('.ace_content');
                        if (editorContent) return editorContent.textContent;

                        throw new Error('Could not find editor content');
                    } catch (e) {
                        console.error('Editor access error:', e);
                        return null;
                    }
                }
            });

            const content = results?.[0]?.result;
            if (!content) throw new Error('Could not extract code from editor');

            // Hide stages section if visible
            stagesContainer.classList.remove('visible');

            // Show hint section and set loading state
            hintSection.style.display = 'block';
            hintResponse.textContent = 'Getting hint...';

            const payload = {
                actualQuestion: content,
                rules: [
                    "provide only hints with actual code syntaxes only",
                    "give hint which conecpt is used",
                    "give him worl flow like first what to do",
                    "dont use any complex funection unless asked and give resopnse as simple plain text ",
                    "keep it short and think he is very beginer of python so pls give him in very basic verison"
                ]
            };

            const apiUrl = 'https://deep.89determined.workers.dev/gemini-pro/hint';
            const hintApiResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!hintApiResponse.ok) throw new Error('Failed to get hint');
            const hintResult = await hintApiResponse.text();
            
            // Clean and display the hint
            const cleanHint = hintResult.replace(/```\w*\n?|```/g, '').trim();
            hintResponse.textContent = cleanHint;
            
            // Automatically show fullscreen hint
            document.getElementById('fullscreenHintContent').innerHTML = cleanHint;
            document.getElementById('fullscreenHintOverlay').style.display = 'flex';
            document.body.style.overflow = 'hidden';
            
            // Save the updated state
            saveState();

        } catch (error) {
            console.error('Hint error:', error);
            hintSection.style.display = 'block';
            hintResponse.textContent = 'Error: ' + error.message;
            saveState();
        }
    });

    pasteEndBtn.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) throw new Error('No active tab found');

            const content = pasteInput.value.trim();
            if (!content) {
                showPasteFeedback('Please paste some code to insert', false);
                return;
            }

            const injectionResult = await injectContent(tab, content);
            
            if (injectionResult?.[0]?.result) {
                showPasteFeedback('Code pasted successfully!', true);
                pasteInput.value = '';
            } else {
                showPasteFeedback('Failed to paste content', false);
            }

            // Save state after pasting
            saveState();
        } catch (error) {
            console.error('Paste at end error:', error);
            showPasteFeedback(`Error: ${error.message}`, false);
        }
    });

    solveBtn.addEventListener('click', async () => {
        // Hide hint section if visible
        hintSection.style.display = 'none';
        try {
            // Show stages when solve button is clicked
            stagesContainer.classList.add('visible');
            
            extractedContent.textContent = 'Extracting...';
            apiResponse.textContent = 'Waiting...';
            finalStatus.textContent = 'Waiting...';

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) throw new Error('No active tab found');

            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    try {
                        const textLayers = document.querySelectorAll('.ace_text-layer');
                        if (textLayers.length > 0) {
                            let content = '';
                            for (const layer of textLayers) {
                                const lines = Array.from(layer.querySelectorAll('.ace_line'));
                                content = lines.map(line => line.textContent).join('\n');
                            }
                            if (content) return content;
                        }

                        const editorElement = document.querySelector('.vpl_ide_file.ace_editor');
                        if (editorElement && window.ace) {
                            const aceId = editorElement.id;
                            const editor = window.ace.edit(aceId);
                            return editor.getValue();
                        }

                        const editorContent = document.querySelector('.ace_content');
                        if (editorContent) return editorContent.textContent;

                        throw new Error('Could not find editor content');
                    } catch (e) {
                        console.error('Editor access error:', e);
                        return null;
                    }
                }
            });

            const content = results?.[0]?.result;
            if (!content) throw new Error('Could not extract code from editor');

            extractedContent.textContent = content;
            apiResponse.textContent = 'Getting solution...';

            const payload = {
                actualQuestion: content,
                rules: [
                    "and mainly just give only one version of the code, never every give multiple codes",
                    "python code without comments or extra text",
                    "very easiest simple beginner version",
                    "no complex functions when not asked",
                    "normal python without AI syntaxes",
                    
                ]
            };

            const apiUrl = 'https://deep.89determined.workers.dev/gemini-pro';
            const solutionResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!solutionResponse.ok) throw new Error('Solution fetch failed');
            const solutionResult = await solutionResponse.text();

            apiResponse.textContent = 'Getting test cases...';
            const testCaseResponse = await fetch(apiUrl + 'test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!testCaseResponse.ok) throw new Error('Test case fetch failed');
            const testCaseResult = await testCaseResponse.text();

            const combinedResult = solutionResult.trim() + '\n\n' + testCaseResult.trim();
            const cleanResult = combinedResult.replace(/```python\n?|```/g, '');

            const injectionResult = await injectContent(tab, cleanResult);
            if (!injectionResult?.[0]?.result) throw new Error('Failed to inject solution');

            apiResponse.textContent = cleanResult;
            finalStatus.textContent = 'Solved successfully!';
        } catch (error) {
            console.error('Error:', error);
            finalStatus.textContent = 'Error: ' + error.message;
            
            // Keep stages visible to show the error
            stagesContainer.classList.add('visible');
            saveState();
        }
    });
});
