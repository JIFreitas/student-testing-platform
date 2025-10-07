const socket = io();
const token = window.location.pathname.split('/')[2];
let studentId = null;
let exercises = [];
let currentExercise = null;

// Rastrear estado dos exercícios
const exerciseStates = new Map(); // exerciseId -> { lastExecutedCode, lastTestResults, codeChanged }

const studentInfo = document.getElementById('studentInfo');
const exercisesContainer = document.getElementById('exercises');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const connectionStatus = document.getElementById('connectionStatus');

async function validateTokenAndLogin() {
    try {
        const response = await fetch(`/api/validate-token/${token}`);
        const data = await response.json();
        
        if (data.valid && data.studentId) {
            studentId = data.studentId;
            studentInfo.textContent = `Aluno: ${studentId}`;
            
            socket.emit('login', { userType: 'student', studentId });
            
            loadExercises();
        } else {
            alert('Sessão expirada ou inválida. Redirecionando para login...');
            window.location.href = '/';
        }
    } catch (error) {
        console.error('Erro ao validar token:', error);
        alert('Erro de autenticação. Redirecionando para login...');
        window.location.href = '/';
    }
}

window.addEventListener('load', validateTokenAndLogin);

socket.on('loginSuccess', (data) => {
    // Login confirmado
});

socket.on('disconnect', () => {
    connectionStatus.textContent = 'Desconectado do servidor';
    connectionStatus.className = 'status disconnected';
});

socket.on('connect', () => {
    connectionStatus.textContent = 'Conectado ao servidor';
    connectionStatus.className = 'status connected';
});

socket.on('chatHistory', (messages) => {
    displayMessages(messages);
});

socket.on('newMessage', (message) => {
    displayMessage(message);
});

socket.on('submissionSuccess', (submission) => {
    showNotification('Exercício submetido com sucesso!', 'success');
    // Recarregar exercícios para atualizar badges e status
    loadExercises();
});

socket.on('submissionError', (error) => {
    showNotification(error.message, 'error');
});

socket.on('loginError', (error) => {
    alert(`Erro de login: ${error.message}`);
    window.location.href = '/';
});

async function loadExercises() {
    try {
        const response = await fetch(`/api/exercises-status/${token}`);
        exercises = await response.json();
        
        // Carregar submissões anteriores do aluno
        await loadPreviousSubmissions();
        
        displayExercises();
    } catch (error) {
        console.error('Erro ao carregar exercícios:', error);
        // Fallback para API antiga se houver erro
        try {
            const fallbackResponse = await fetch('/api/exercises');
            exercises = await fallbackResponse.json();
            displayExercises();
        } catch (fallbackError) {
            console.error('Erro no fallback:', fallbackError);
        }
    }
}

// Nova função para carregar submissões anteriores
async function loadPreviousSubmissions() {
    try {
        const response = await fetch(`/api/student-submissions/${token}`);
        if (response.ok) {
            const submissions = await response.json();
            
            // Para cada exercício, verificar se há submissão anterior
            exercises.forEach(exercise => {
                const submission = submissions.find(sub => sub.exerciseId === exercise.id);
                if (submission) {
                    // Restaurar o código da última submissão
                    exercise.lastSubmittedCode = submission.code;
                    
                    // Se a submissão foi bem-sucedida, inicializar o estado como se os testes tivessem sido executados
                    if (submission.completed && submission.testResults) {
                        exerciseStates.set(exercise.id, {
                            lastExecutedCode: submission.code,
                            lastTestResults: submission.testResults,
                            codeChanged: false
                        });
                    }
                }
            });
        }
    } catch (error) {
        // Nenhuma submissão anterior encontrada
    }
}

function displayExercises() {
    exercisesContainer.innerHTML = exercises.map(exercise => {
        const isExample = exercise.isExample || false;
        const isCompleted = exercise.completed || false;
        const isAccessible = exercise.accessible !== false; // Default true se não especificado
        const isCodingType = exercise.type === 'coding';
        
        const headerClass = isExample ? 'exercise-header example' : 
                           !isAccessible ? 'exercise-header locked' : 'exercise-header';
        
        const textareaClass = (isExample || !isAccessible) ? 'readonly' : '';
        const textareaProps = (isExample || !isAccessible) ? 'readonly' : '';
        const submitButtonProps = (isExample || !isAccessible) ? 'disabled' : '';
        const clearButtonProps = (isExample || !isAccessible) ? 'disabled' : '';
        
        // Badge para exercícios completos
        const badgeHtml = isCompleted ? '<span class="badge-completed">Concluído</span>' : '';
        
        // Mensagem de bloqueio
        const lockMessage = !isAccessible ? '<div class="lock-message">Complete o exercício anterior para desbloquear</div>' : '';
        
        // Seções diferentes para exercícios normais vs exercícios de programação
        let codeSection = '';
        
        // Usar código da última submissão se existir, senão usar baseCode
        const codeToShow = exercise.lastSubmittedCode || exercise.baseCode;
        
        if (isCodingType) {
            // Exercício de programação: testes fixos + área de código
            codeSection = `
                <div class="readonly-code-section">
                    <div class="readonly-code-header">Testes (não editável):</div>
                    <div class="readonly-code">${exercise.testCode}</div>
                </div>
                <div class="editable-code-header">Implementa a função aqui:</div>
                <textarea id="code-${exercise.id}" class="${textareaClass}" ${textareaProps} placeholder="${!isAccessible ? 'Exercício bloqueado' : 'Implementa a função aqui...'}">${codeToShow}</textarea>
            `;
        } else {
            // Exercício normal: função fixa + área de testes
            const hasReadOnlyCode = exercise.readOnlyCode && exercise.readOnlyCode.trim() !== '';
            const readOnlySection = hasReadOnlyCode ? `
                <div class="readonly-code-section">
                    <div class="readonly-code-header">Função para testar (não editável):</div>
                    <div class="readonly-code">${exercise.readOnlyCode}</div>
                </div>
            ` : '';
            
            codeSection = `
                ${readOnlySection}
                <div class="editable-code-header">
                    Área de testes (editável)
                    <span id="test-counter-${exercise.id}" class="test-counter">0 testes escritos (mínimo: 3)</span>
                </div>
                <textarea id="code-${exercise.id}" class="${textareaClass}" ${textareaProps} placeholder="${isExample ? 'Este é um exemplo - apenas podes executar os testes' : !isAccessible ? 'Exercício bloqueado' : 'Escreve os teus testes aqui...'}" oninput="updateTestCounter(${exercise.id})">${codeToShow}</textarea>
            `;
        }
        
        return `
            <div class="exercise ${!isAccessible ? 'locked' : ''}">
                <div class="${headerClass}" onclick="toggleExercise(${exercise.id})">
                    <span>${exercise.title} ${badgeHtml}</span>
                    <span>▼</span>
                </div>
                <div class="exercise-content" id="exercise-${exercise.id}">
                    <div class="exercise-description">${exercise.description}</div>
                    ${lockMessage}
                    ${codeSection}
                    <div class="exercise-buttons">
                        <button class="btn btn-test" ${!isAccessible ? 'disabled' : ''} onclick="runTests(${exercise.id})">Executar Testes</button>
                        <button class="btn btn-submit btn-disabled" ${submitButtonProps} onclick="submitExercise(${exercise.id})" disabled>${isExample ? 'Exemplo - Não Submetível' : !isAccessible ? 'Bloqueado' : 'Execute os testes primeiro'}</button>
                        <button class="btn btn-clear" ${clearButtonProps} onclick="clearCode(${exercise.id})">${isExample ? 'Repor Exemplo' : !isAccessible ? 'Bloqueado' : 'Limpar'}</button>
                    </div>
                    <div id="results-${exercise.id}" class="test-results" style="display: none;"></div>
                </div>
            </div>
        `;
    }).join('');
    
    // Atualizar contadores de teste para exercícios não de programação
    exercises.forEach(exercise => {
        // Só inicializar estado do exercício se ainda não existe (pode ter sido definido em loadPreviousSubmissions)
        if (!exerciseStates.has(exercise.id)) {
            exerciseStates.set(exercise.id, {
                lastExecutedCode: null,
                lastTestResults: null,
                codeChanged: false
            });
        }
        
        // Verificar se já tem estado válido (de submissão anterior)
        const state = exerciseStates.get(exercise.id);
        const hasValidState = state.lastTestResults && state.lastExecutedCode && !state.codeChanged;
        
        if (exercise.type !== 'coding') {
            setTimeout(() => {
                updateTestCounter(exercise.id);
                // Se tem estado válido, habilitar submissão
                if (hasValidState) {
                    updateSubmitButton(exercise.id, true);
                }
            }, 100);
        } else {
            // Para exercícios de programação, verificar se pode submeter
            setTimeout(() => {
                if (hasValidState && state.lastTestResults.allPassed) {
                    updateSubmitButton(exercise.id, true);
                } else {
                    updateSubmitButton(exercise.id, false);
                }
            }, 100);
        }
    });
}

function toggleExercise(exerciseId) {
    const content = document.getElementById(`exercise-${exerciseId}`);
    const isActive = content.classList.contains('active');
    
    document.querySelectorAll('.exercise-content').forEach(el => {
        el.classList.remove('active');
    });

    if (!isActive) {
        content.classList.add('active');
        currentExercise = exerciseId;
        
        // Atualizar contador de testes quando abrir exercício
        updateTestCounter(exerciseId);
    } else {
        currentExercise = null;
    }
}

// Nova função para atualizar contador de testes e detectar mudanças
function updateTestCounter(exerciseId) {
    const exercise = exercises.find(ex => ex.id === exerciseId);
    const counterSpan = document.getElementById(`test-counter-${exerciseId}`);
    const codeTextarea = document.getElementById(`code-${exerciseId}`);
    
    if (!exercise || exercise.type === 'coding' || !counterSpan || !codeTextarea) {
        return;
    }
    
    const code = codeTextarea.value;
    const testCount = (code.match(/console\.assert\s*\(/g) || []).length;
    
    // Verificar se o código mudou desde a última execução (só se já houve execução)
    const state = exerciseStates.get(exerciseId) || {};
    
    if (state.lastExecutedCode !== null && state.lastExecutedCode !== code) {
        // Só marcar como alterado se realmente havia código executado antes
        exerciseStates.set(exerciseId, {
            ...state,
            codeChanged: true,
            lastTestResults: null
        });
        
        // Limpar resultados antigos se código mudou
        const resultsDiv = document.getElementById(`results-${exerciseId}`);
        if (resultsDiv && resultsDiv.style.display !== 'none') {
            resultsDiv.innerHTML = '<div class="warning-message">Código alterado. Execute os testes novamente para submeter.</div>';
            resultsDiv.className = 'test-results warning';
        }
        
        // Desabilitar botão de submissão
        updateSubmitButton(exerciseId, false);
    }
    
    if (testCount >= 3) {
        counterSpan.innerHTML = `<span class="test-count-good">${testCount} testes escritos ✓</span>`;
    } else {
        counterSpan.innerHTML = `<span class="test-count-bad">${testCount} testes escritos (mínimo: 3)</span>`;
    }
}

// Nova função para atualizar estado do botão de submissão
function updateSubmitButton(exerciseId, canSubmit) {
    const submitBtn = document.querySelector(`button[onclick="submitExercise(${exerciseId})"]`);
    if (submitBtn) {
        submitBtn.disabled = !canSubmit;
        if (canSubmit) {
            submitBtn.textContent = 'Submeter';
            submitBtn.classList.remove('btn-disabled');
        } else {
            submitBtn.textContent = 'Execute os testes primeiro';
            submitBtn.classList.add('btn-disabled');
        }
    }
}

// Função de debug temporária
function debugExerciseState(exerciseId) {
    const state = exerciseStates.get(exerciseId) || {};
    const codeTextarea = document.getElementById(`code-${exerciseId}`);
    const currentCode = codeTextarea ? codeTextarea.value : 'N/A';
    
    return state;
}

function runTests(exerciseId) {
    const codeTextarea = document.getElementById(`code-${exerciseId}`);
    const resultsDiv = document.getElementById(`results-${exerciseId}`);
    const code = codeTextarea.value;

    resultsDiv.style.display = 'block';
    resultsDiv.className = 'test-results info';
    resultsDiv.textContent = 'Executando testes...';

    try {
        const logs = [];
        const assertions = [];
        
        const originalLog = console.log;
        const originalAssert = console.assert;
        
        console.log = (...args) => logs.push(args.join(' '));
        console.assert = (condition, message) => {
            if (!condition) {
                assertions.push(`FALHOU: ${message}`);
            } else {
                assertions.push(`PASSOU: ${message}`);
            }
        };

        // Encontrar o exercício atual
        const exercise = exercises.find(ex => ex.id === exerciseId);
        let fullCode = '';
        
        if (exercise.type === 'coding') {
            // Exercício de programação: código do aluno + testes do professor
            fullCode = code + '\n\n' + exercise.testCode;
        } else {
            // Exercício normal: função do professor + testes do aluno
            if (exercise && exercise.readOnlyCode) {
                fullCode = exercise.readOnlyCode + '\n\n' + code;
            } else {
                fullCode = code;
            }
        }

        eval(fullCode);

        console.log = originalLog;
        console.assert = originalAssert;

        const results = [];
        if (logs.length > 0) {
            results.push('=== OUTPUTS ===');
            results.push(...logs);
        }
        if (assertions.length > 0) {
            results.push('\n=== TESTES ===');
            results.push(...assertions);
        }

        const passed = assertions.filter(a => a.includes('PASSOU')).length;
        const failed = assertions.filter(a => a.includes('FALHOU')).length;
        
        if (results.length === 0) {
            results.push('Nenhum teste encontrado. Use console.assert() para criar testes.');
        }

        results.push(`\n=== RESUMO ===`);
        results.push(`Testes executados: ${assertions.length}`);
        results.push(`Passou: ${passed}`);
        results.push(`Falhou: ${failed}`);

        resultsDiv.textContent = results.join('\n');
        resultsDiv.className = failed > 0 ? 'test-results error' : 'test-results success';

        // Atualizar estado do exercício após execução
        const testResults = {
            output: results.join('\n'),
            allPassed: failed === 0 && passed > 0,
            passed: passed,
            failed: failed
        };
        
        exerciseStates.set(exerciseId, {
            lastExecutedCode: code,
            lastTestResults: testResults,
            codeChanged: false
        });
        
        // Habilitar submissão apenas se for exercício de programação OU se todos os critérios forem atendidos
        const canSubmit = exercise.type === 'coding' ? 
            testResults.allPassed : 
            (testResults.allPassed && passed >= 3 && (code.match(/console\.assert\s*\(/g) || []).length >= 3);
            
        updateSubmitButton(exerciseId, canSubmit);

    } catch (error) {
        resultsDiv.textContent = `Erro na execução:\n${error.message}`;
        resultsDiv.className = 'test-results error';
        
        // Desabilitar submissão em caso de erro
        updateSubmitButton(exerciseId, false);
        
        exerciseStates.set(exerciseId, {
            lastExecutedCode: code,
            lastTestResults: null,
            codeChanged: false
        });
    }
}

function submitExercise(exerciseId) {
    const exercise = exercises.find(ex => ex.id === exerciseId);
    if (exercise && exercise.isExample) {
        showNotification('Este é um exemplo e não pode ser submetido', 'error');
        return;
    }
    
    const codeTextarea = document.getElementById(`code-${exerciseId}`);
    const code = codeTextarea.value.trim();
    
    if (!code) {
        showNotification('Por favor, escreve algum código antes de submeter', 'error');
        return;
    }

    // Verificar estado do exercício
    const state = exerciseStates.get(exerciseId) || {};
    
    // Debug - vamos ver o que está a acontecer
    // 1. Verificar se o código foi executado
    if (!state.lastTestResults) {
        showNotification('Deves executar os testes primeiro antes de submeter!', 'error');
        return;
    }
    
    if (state.codeChanged) {
        showNotification('Código foi alterado. Execute os testes novamente antes de submeter!', 'error');
        return;
    }
    
    if (state.lastExecutedCode !== code) {
        showNotification('O código atual é diferente do código testado. Execute os testes novamente!', 'error');
        return;
    }

    // Validações específicas para exercícios de teste (não de programação)
    if (exercise.type !== 'coding') {
        // 2. Verificar se tem pelo menos 3 console.assert
        const assertCount = (code.match(/console\.assert\s*\(/g) || []).length;
        if (assertCount < 3) {
            showNotification('Deves escrever pelo menos 3 testes usando console.assert!', 'error');
            return;
        }

        // 3. Verificar se todos os testes passaram
        if (!state.lastTestResults.allPassed || state.lastTestResults.failed > 0) {
            showNotification('Todos os testes devem passar antes de submeter! Corrige os testes que falharam.', 'error');
            return;
        }
        
        // 4. Verificar se pelo menos 3 testes passaram
        if (state.lastTestResults.passed < 3) {
            showNotification('Pelo menos 3 testes devem passar!', 'error');
            return;
        }
    } else {
        // Para exercícios de programação, verificar se todos os testes passaram
        if (!state.lastTestResults.allPassed || state.lastTestResults.failed > 0) {
            showNotification('Todos os testes devem passar antes de submeter! Corrige a tua implementação.', 'error');
            return;
        }
    }

    // Se chegou aqui, pode submeter
    socket.emit('submitExercise', {
        exerciseId,
        code,
        testResults: state.lastTestResults
    });
}

function clearCode(exerciseId) {
    const exercise = exercises.find(ex => ex.id === exerciseId);
    if (exercise) {
        document.getElementById(`code-${exerciseId}`).value = exercise.baseCode;
        document.getElementById(`results-${exerciseId}`).style.display = 'none';
        
        if (exercise.isExample) {
            showNotification('Exemplo reposto ao estado original', 'success');
        }
    }
}

function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    socket.emit('sendMessage', { message });
    messageInput.value = '';
}

function displayMessages(messages) {
    chatMessages.innerHTML = '';
    messages.forEach(displayMessage);
}

function displayMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.type}`;
    
    const time = new Date(message.timestamp).toLocaleTimeString('pt-PT');
    const sender = message.type === 'admin' ? 'Suporte' : 'Você';
    
    messageDiv.innerHTML = `
        <div>${message.message}</div>
        <div class="message-time">${sender} - ${time}</div>
    `;

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `status ${type === 'error' ? 'disconnected' : 'connected'}`;
    notification.textContent = message;
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.right = '20px';
    notification.style.zIndex = '1000';
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        document.body.removeChild(notification);
    }, 3000);
}

function logout() {
    window.location.href = '/';
}

// Enter key support para chat
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});