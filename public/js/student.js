const socket = io();
const token = window.location.pathname.split('/')[2];
let studentId = null;
let exercises = [];
let currentExercise = null;

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
    console.log('Login confirmado via socket');
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
        
        if (isCodingType) {
            // Exercício de programação: testes fixos + área de código
            codeSection = `
                <div class="readonly-code-section">
                    <div class="readonly-code-header">Testes (não editável):</div>
                    <div class="readonly-code">${exercise.testCode}</div>
                </div>
                <div class="editable-code-header">Implementa a função aqui:</div>
                <textarea id="code-${exercise.id}" class="${textareaClass}" ${textareaProps} placeholder="${!isAccessible ? 'Exercício bloqueado' : 'Implementa a função aqui...'}">${exercise.baseCode}</textarea>
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
                <div class="editable-code-header">Área de testes (editável):</div>
                <textarea id="code-${exercise.id}" class="${textareaClass}" ${textareaProps} placeholder="${isExample ? 'Este é um exemplo - apenas podes executar os testes' : !isAccessible ? 'Exercício bloqueado' : 'Escreve os teus testes aqui...'}">${exercise.baseCode}</textarea>
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
                        <button class="btn btn-submit" ${submitButtonProps} onclick="submitExercise(${exercise.id})">${isExample ? 'Exemplo - Não Submetível' : !isAccessible ? 'Bloqueado' : 'Submeter'}</button>
                        <button class="btn btn-clear" ${clearButtonProps} onclick="clearCode(${exercise.id})">${isExample ? 'Repor Exemplo' : !isAccessible ? 'Bloqueado' : 'Limpar'}</button>
                    </div>
                    <div id="results-${exercise.id}" class="test-results" style="display: none;"></div>
                </div>
            </div>
        `;
    }).join('');
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
    } else {
        currentExercise = null;
    }
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

    } catch (error) {
        resultsDiv.textContent = `Erro na execução:\n${error.message}`;
        resultsDiv.className = 'test-results error';
    }
}

function submitExercise(exerciseId) {
    const exercise = exercises.find(ex => ex.id === exerciseId);
    if (exercise && exercise.isExample) {
        showNotification('Este é um exemplo e não pode ser submetido', 'error');
        return;
    }
    
    const codeTextarea = document.getElementById(`code-${exerciseId}`);
    const resultsDiv = document.getElementById(`results-${exerciseId}`);
    
    const code = codeTextarea.value.trim();
    if (!code) {
        showNotification('Por favor, escreve algum código antes de submeter', 'error');
        return;
    }

    // Calcular se todos os testes passaram
    const resultsText = resultsDiv.textContent || '';
    const passedCount = (resultsText.match(/PASSOU:/g) || []).length;
    const failedCount = (resultsText.match(/FALHOU:/g) || []).length;
    const allPassed = failedCount === 0 && passedCount > 0;

    const testResults = {
        output: resultsText,
        allPassed: allPassed,
        passed: passedCount,
        failed: failedCount
    };

    socket.emit('submitExercise', {
        exerciseId,
        code,
        testResults
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