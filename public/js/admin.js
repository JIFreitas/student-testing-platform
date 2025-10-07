const socket = io();
let submissions = [];
let exercises = [];
let chats = new Map();

const submissionsContainer = document.getElementById('submissions');
const chatsContainer = document.getElementById('chats');
const connectionStatus = document.getElementById('connectionStatus');
const totalStudents = document.getElementById('totalStudents');
const totalSubmissions = document.getElementById('totalSubmissions');
const totalChats = document.getElementById('totalChats');
const totalMessages = document.getElementById('totalMessages');
const onlineCount = document.getElementById('onlineCount');

// Login automático como admin
socket.emit('login', { userType: 'admin' });

// Event listeners do Socket.IO
socket.on('loginSuccess', () => {
    loadExercises();
});

socket.on('disconnect', () => {
    connectionStatus.textContent = 'Desconectado do servidor';
    connectionStatus.className = 'status disconnected';
});

socket.on('connect', () => {
    connectionStatus.textContent = 'Conectado ao servidor';
    connectionStatus.className = 'status connected';
});

socket.on('allSubmissions', (data) => {
    submissions = Array.isArray(data) ? data : [];
    displaySubmissions();
    updateStats();
});

socket.on('allChats', (data) => {
    chats = Array.isArray(data) ? data : [];
    displayChats();
    updateStats();
});

socket.on('newSubmission', (submission) => {
    if (!submission || !submission.studentId) {
        console.warn('Submissão inválida:', submission);
        return;
    }
    
    if (!Array.isArray(submissions)) {
        submissions = [];
    }
    
    submissions.push(submission);
    displaySubmissions();
    updateStats();
    showNotification(`Nova submissão do aluno ${submission.studentId}`, 'info');
});

socket.on('newMessage', (message) => {
    if (!message || !message.studentId) {
        console.warn('Mensagem inválida:', message);
        return;
    }
    
    if (!Array.isArray(chats)) {
        chats = [];
    }
    
    let chatIndex = chats.findIndex(chat => chat && chat.studentId === message.studentId);
    if (chatIndex === -1) {
        chats.push({ studentId: message.studentId, messages: [message] });
    } else {
        if (!Array.isArray(chats[chatIndex].messages)) {
            chats[chatIndex].messages = [];
        }
        chats[chatIndex].messages.push(message);
    }
    displayChats();
    updateStats();
    
    if (message.type === 'student') {
        showNotification(`Nova mensagem do aluno ${message.studentId}`, 'info');
    }
});

async function loadExercises() {
    try {
        const response = await fetch('/api/exercises');
        exercises = await response.json();
    } catch (error) {
        console.error('Erro ao carregar exercícios:', error);
    }
}

function getExerciseTitle(exerciseId) {
    const exercise = exercises.find(ex => ex.id === exerciseId);
    return exercise ? exercise.title : `Exercício ${exerciseId}`;
}

function displaySubmissions() {
    if (!Array.isArray(submissions) || submissions.length === 0) {
        submissionsContainer.innerHTML = '<div class="empty-state">Nenhuma submissão encontrada</div>';
        return;
    }

    submissionsContainer.innerHTML = submissions.map((submission, index) => {
        if (!submission || !submission.studentId || !submission.timestamp) {
            console.warn('Submissão inválida:', submission);
            return '';
        }
        
        const time = new Date(submission.timestamp).toLocaleString('pt-PT');
        
        return `
            <div class="submission">
                <div class="submission-header" onclick="toggleSubmission(${index})">
                    <span class="exercise-title">${getExerciseTitle(submission.exerciseId)}</span>
                    <span>Aluno ${submission.studentId} - ${time} ▼</span>
                </div>
                <div class="submission-content" id="submission-${index}">
                    <div class="submission-meta">
                        <strong>Aluno:</strong> ${submission.studentId}<br>
                        <strong>Exercício:</strong> ${getExerciseTitle(submission.exerciseId)}<br>
                        <strong>Data:</strong> ${time}
                    </div>
                    <div>
                        <strong>Código Submetido:</strong>
                        <div class="code-block">${submission.code || 'N/A'}</div>
                    </div>
                    <div>
                        <strong>Resultados dos Testes:</strong>
                        <div class="test-results">${submission.testResults || 'N/A'}</div>
                    </div>
                </div>
            </div>
        `;
    }).filter(html => html !== '').join('');
}

function displayChats() {
    if (!Array.isArray(chats) || chats.length === 0) {
        chatsContainer.innerHTML = '<div class="empty-state">Nenhuma conversa ativa</div>';
        return;
    }

    chatsContainer.innerHTML = chats.map((chat, index) => {
        if (!chat || !chat.studentId || !Array.isArray(chat.messages)) {
            console.warn('Chat inválido:', chat);
            return '';
        }
        
        const unreadCount = chat.messages.filter(m => m && m.type === 'student').length;
        const lastMessage = chat.messages[chat.messages.length - 1];
        const lastTime = lastMessage && lastMessage.timestamp ? new Date(lastMessage.timestamp).toLocaleString('pt-PT') : '';

        return `
            <div class="chat-item">
                <div class="chat-header" onclick="toggleChat(${index})">
                    <span>Aluno ${chat.studentId}</span>
                    <span>
                        ${lastTime}
                        ${unreadCount > 0 ? `<span class="badge">${unreadCount}</span>` : ''}
                        ▼
                    </span>
                </div>
                <div class="chat-content" id="chat-${index}">
                    <div class="chat-messages">
                        ${chat.messages.map(message => {
                            if (!message || !message.timestamp || !message.message) {
                                return '';
                            }
                            const time = new Date(message.timestamp).toLocaleTimeString('pt-PT');
                            const sender = message.type === 'admin' ? 'Admin' : `Aluno ${message.studentId || chat.studentId}`;
                            
                            return `
                                <div class="message ${message.type || 'student'}">
                                    <div>${message.message}</div>
                                    <div class="message-time">${sender} - ${time}</div>
                                </div>
                            `;
                        }).filter(html => html !== '').join('')}
                    </div>
                    <div class="chat-input">
                        <input type="text" placeholder="Responder ao aluno..." id="input-${chat.studentId}" />
                        <button class="btn btn-send" onclick="sendMessage('${chat.studentId}')">Enviar</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function toggleSubmission(index) {
    const content = document.getElementById(`submission-${index}`);
    const isActive = content.classList.contains('active');
    
    document.querySelectorAll('.submission-content').forEach(el => {
        el.classList.remove('active');
    });

    if (!isActive) {
        content.classList.add('active');
    }
}

function toggleChat(index) {
    const content = document.getElementById(`chat-${index}`);
    const isActive = content.classList.contains('active');
    
    document.querySelectorAll('.chat-content').forEach(el => {
        el.classList.remove('active');
    });

    // Abrir o chat clicado se não estava ativo
    if (!isActive) {
        content.classList.add('active');
        // Scroll para a última mensagem
        setTimeout(() => {
            const messagesDiv = content.querySelector('.chat-messages');
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }, 100);
    }
}

function sendMessage(studentId) {
    const input = document.getElementById(`input-${studentId}`);
    const message = input.value.trim();
    
    if (!message) return;

    socket.emit('sendMessage', { message, targetStudentId: studentId });
    input.value = '';
}

function updateStats() {
    try {
        const validSubmissions = Array.isArray(submissions) ? submissions.filter(s => s && s.studentId) : [];
        const validChats = Array.isArray(chats) ? chats.filter(c => c && c.studentId && Array.isArray(c.messages)) : [];
        
        const uniqueStudents = new Set(validSubmissions.map(s => s.studentId)).size;
        const totalMsgs = validChats.reduce((total, chat) => {
            return total + (chat.messages ? chat.messages.length : 0);
        }, 0);

        totalStudents.textContent = uniqueStudents;
        totalSubmissions.textContent = validSubmissions.length;
        totalChats.textContent = validChats.length;
        totalMessages.textContent = totalMsgs;
        onlineCount.textContent = `${validChats.length} conversas`;
    } catch (error) {
        console.error('Erro ao atualizar estatísticas:', error);
        totalStudents.textContent = '0';
        totalSubmissions.textContent = '0';
        totalChats.textContent = '0';
        totalMessages.textContent = '0';
        onlineCount.textContent = '0 conversas';
    }
}

function refreshData() {
    socket.emit('login', { userType: 'admin' });
    showNotification('Dados atualizados', 'success');
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `status ${type === 'error' ? 'disconnected' : 'connected'}`;
    notification.textContent = message;
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.right = '20px';
    notification.style.zIndex = '1000';
    notification.style.minWidth = '200px';
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (document.body.contains(notification)) {
            document.body.removeChild(notification);
        }
    }, 3000);
}

function logout() {
    window.location.href = '/';
}

document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && e.target.matches('input[id^="input-"]')) {
        const studentId = e.target.id.replace('input-', '');
        sendMessage(studentId);
    }
});

setInterval(refreshData, 30000);