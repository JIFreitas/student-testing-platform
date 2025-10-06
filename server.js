const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const jwt = require('jsonwebtoken');
const fs = require('fs').promises;

// Chave secreta para JWT (em produção, usar variável de ambiente)
const JWT_SECRET = 'mestrado-testes-secret-key-2025';

// Caminhos dos ficheiros de dados
const DATA_DIR = path.join(__dirname, 'data');
const SUBMISSIONS_FILE = path.join(DATA_DIR, 'submissions.json');
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Configuração do servidor
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Armazenamento em memória
const users = new Map(); // userId -> { type: 'student'|'admin', studentId?: string, socketId: string }
const exercises = [
  {
    id: 0,
    title: "Exemplo - Teste de Função Soma",
    description: "Este é um exemplo de como criar testes para uma função. Estuda este exemplo antes de resolver os exercícios.",
    isExample: true,
    readOnlyCode: `function soma(a, b) {
  return a + b;
}`,
    baseCode: `// EXEMPLO DE TESTES COMPLETOS:
console.assert(soma(2, 3) === 5, "2 + 3 deve ser 5");
console.assert(soma(0, 0) === 0, "0 + 0 deve ser 0");
console.assert(soma(-1, 1) === 0, "-1 + 1 deve ser 0");
console.assert(soma(10, -5) === 5, "10 + (-5) deve ser 5");
console.assert(soma(1.5, 2.5) === 4, "1.5 + 2.5 deve ser 4");

// Teste com tipos inválidos
console.assert(isNaN(soma("a", 5)), "soma com string deve retornar NaN");

console.log("Exemplo: Todos os testes executados!");
console.log("Agora podes resolver os exercícios seguintes!");`
  },
  {
    id: 1,
    title: "Exercício 1 - Teste de Validação de Email",
    description: "Crie testes abrangentes para uma função que valida endereços de email. A função já está implementada - concentra-te em escrever testes que cubram diferentes cenários.",
    isExample: false,
    readOnlyCode: `function validarEmail(email) {
  const regex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  return regex.test(email);
}`,
    baseCode: `// Escreve os teus testes aqui usando console.assert:
// Exemplo: console.assert(validarEmail("test@example.com") === true, "Email válido deve retornar true");

`
  },
  {
    id: 2,
    title: "Exercício 2 - Teste de Array Ordenação",
    description: "Crie testes para uma função que ordena um array de números. A função está implementada - testa diferentes tipos de arrays.",
    isExample: false,
    readOnlyCode: `function ordenarArray(arr) {
  return [...arr].sort((a, b) => a - b);
}`,
    baseCode: `// Escreve os teus testes aqui usando console.assert:
// Exemplo: console.assert(JSON.stringify(ordenarArray([3,1,2])) === JSON.stringify([1,2,3]), "Array deve ser ordenado");

`
  },
  {
    id: 3,
    title: "Exercício 3 - Teste de Calculadora",
    description: "Crie testes para uma calculadora simples com múltiplas operações. A função está implementada - testa todas as operações e casos especiais.",
    isExample: false,
    readOnlyCode: `function calculadora(operacao, a, b) {
  switch(operacao) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b !== 0 ? a / b : null;
    default: return null;
  }
}`,
    baseCode: `// Escreve os teus testes aqui usando console.assert:
// Exemplo: console.assert(calculadora('+', 5, 3) === 8, "5 + 3 deve ser 8");

`
  },
  {
    id: 4,
    title: "Programação - Função Fatorial",
    description: "Implementa uma função que calcula o fatorial de um número. Os testes já estão prontos - faz a função passar em todos eles.",
    type: "coding", // Novo tipo: o aluno escreve a função
    testCode: `// TESTES PRONTOS - NÃO MODIFICAR
console.assert(fatorial(0) === 1, "fatorial(0) deve ser 1");
console.assert(fatorial(1) === 1, "fatorial(1) deve ser 1");
console.assert(fatorial(5) === 120, "fatorial(5) deve ser 120");
console.assert(fatorial(3) === 6, "fatorial(3) deve ser 6");
console.assert(fatorial(4) === 24, "fatorial(4) deve ser 24");

console.log("Todos os testes passaram! Parabéns!");`,
    baseCode: `// Implementa a função fatorial aqui:
function fatorial(n) {
  // O teu código aqui
  
}
`
  }
];

const submissions = new Map(); // studentId -> [{ exerciseId, code, timestamp, result }]
const chats = new Map(); // studentId -> [{ message, timestamp, type: 'student'|'admin' }]

// Função para verificar se um exercício está completo
function isExerciseCompleted(studentId, exerciseId) {
  const studentSubmissions = submissions.get(studentId);
  if (!studentSubmissions) return false;
  
  const submission = studentSubmissions.find(sub => sub.exerciseId === exerciseId);
  if (!submission) return false;
  
  // Verificar se foi marcado como completo
  if (submission.completed === true) return true;
  
  // Verificar formato novo dos resultados
  if (submission.testResults && typeof submission.testResults === 'object') {
    return submission.testResults.allPassed === true;
  }
  
  // Verificar formato antigo dos resultados (string)
  if (submission.testResults && typeof submission.testResults === 'string') {
    return submission.testResults.includes('Falhou: 0') && 
           submission.testResults.includes('Passou:') &&
           !submission.testResults.includes('Testes executados: 0');
  }
  
  return false;
}

// Função para verificar se o aluno pode acessar um exercício
function canAccessExercise(studentId, exerciseId) {
  if (exerciseId === 0) return true; // Exemplo sempre acessível
  if (exerciseId === 1) return true; // Primeiro exercício sempre acessível
  
  // Para exercícios 2+, precisa ter completado o anterior
  return isExerciseCompleted(studentId, exerciseId - 1);
}

// Funções de persistência
async function ensureDataDirectory() {
  try {
    await fs.access(DATA_DIR);
  } catch (error) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    console.log('📁 Diretório de dados criado:', DATA_DIR);
  }
}

async function loadData() {
  try {
    await ensureDataDirectory();
    
    // Carregar submissões
    try {
      const submissionsData = await fs.readFile(SUBMISSIONS_FILE, 'utf8');
      const submissionsObj = JSON.parse(submissionsData);
      Object.entries(submissionsObj).forEach(([studentId, submissionList]) => {
        submissions.set(studentId, submissionList);
      });
      console.log('📚 Submissões carregadas:', submissions.size, 'estudantes');
    } catch (error) {
      console.log('📚 Nenhuma submissão anterior encontrada');
    }
    
    // Carregar chats
    try {
      const chatsData = await fs.readFile(CHATS_FILE, 'utf8');
      const chatsObj = JSON.parse(chatsData);
      Object.entries(chatsObj).forEach(([studentId, messageList]) => {
        chats.set(studentId, messageList);
      });
      console.log('💬 Chats carregados:', chats.size, 'conversas');
    } catch (error) {
      console.log('💬 Nenhum chat anterior encontrado');
    }
  } catch (error) {
    console.error('❌ Erro ao carregar dados:', error);
  }
}

async function saveSubmissions() {
  try {
    const submissionsObj = Object.fromEntries(submissions);
    await fs.writeFile(SUBMISSIONS_FILE, JSON.stringify(submissionsObj, null, 2));
    console.log('💾 Submissões guardadas');
  } catch (error) {
    console.error('❌ Erro ao guardar submissões:', error);
  }
}

async function saveChats() {
  try {
    const chatsObj = Object.fromEntries(chats);
    await fs.writeFile(CHATS_FILE, JSON.stringify(chatsObj, null, 2));
    console.log('💾 Chats guardados');
  } catch (error) {
    console.error('❌ Erro ao guardar chats:', error);
  }
}

// Auto-save a cada 30 segundos
setInterval(async () => {
  await saveSubmissions();
  await saveChats();
}, 30000);

// Rotas
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/student/:token', (req, res) => {
  try {
    // Verificar e decodificar o token
    const decoded = jwt.verify(req.params.token, JWT_SECRET);
    if (decoded.type !== 'student') {
      return res.status(403).send('Acesso negado');
    }
    res.sendFile(path.join(__dirname, 'public', 'student.html'));
  } catch (error) {
    res.status(403).send('Token inválido ou expirado');
  }
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/exercises', (req, res) => {
  res.json(exercises);
});

// Rota para obter status dos exercícios para um aluno
app.get('/api/exercises-status/:token', (req, res) => {
  try {
    const decoded = jwt.verify(req.params.token, JWT_SECRET);
    if (decoded.type !== 'student') {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    
    const studentId = decoded.studentId;
    const exercisesWithStatus = exercises.map(exercise => ({
      ...exercise,
      completed: isExerciseCompleted(studentId, exercise.id),
      accessible: canAccessExercise(studentId, exercise.id)
    }));
    
    res.json(exercisesWithStatus);
  } catch (error) {
    res.status(403).json({ error: 'Token inválido' });
  }
});

// Rota para gerar token de acesso seguro
app.post('/api/generate-token', express.json(), (req, res) => {
  const { userType, studentId } = req.body;
  
  if (userType === 'student' && studentId) {
    // Validar formato do número de aluno
    if (!/^\d+$/.test(studentId)) {
      return res.status(400).json({ error: 'Número de aluno inválido' });
    }
    
    const token = jwt.sign(
      { type: 'student', studentId, timestamp: Date.now() },
      JWT_SECRET,
      { expiresIn: '24h' } // Token expira em 24 horas
    );
    
    res.json({ token, studentId });
  } else if (userType === 'admin') {
    res.json({ redirect: '/admin' });
  } else {
    res.status(400).json({ error: 'Dados inválidos' });
  }
});

// Rota para validar token e obter dados do aluno
app.get('/api/validate-token/:token', (req, res) => {
  try {
    const decoded = jwt.verify(req.params.token, JWT_SECRET);
    if (decoded.type === 'student') {
      res.json({ valid: true, studentId: decoded.studentId });
    } else {
      res.status(403).json({ valid: false, error: 'Tipo de token inválido' });
    }
  } catch (error) {
    res.status(403).json({ valid: false, error: 'Token inválido ou expirado' });
  }
});

// WebSocket connections
io.on('connection', (socket) => {
  console.log('Novo utilizador conectado:', socket.id);

  // Login de utilizador
  socket.on('login', (data) => {
    const { userType, studentId } = data;
    
    if (userType === 'admin') {
      users.set(socket.id, { type: 'admin', socketId: socket.id });
      socket.join('admin');
      socket.emit('loginSuccess', { userType: 'admin' });
      
      // Enviar dados existentes para o admin
      const allSubmissions = [];
      submissions.forEach((submissionArray, studentId) => {
        submissionArray.forEach(submission => {
          allSubmissions.push({
            studentId,
            ...submission
          });
        });
      });
      socket.emit('allSubmissions', allSubmissions);
      
      const allChats = [];
      chats.forEach((messages, studentId) => {
        if (messages.length > 0) {
          allChats.push({
            studentId,
            messages
          });
        }
      });
      socket.emit('allChats', allChats);
      
    } else if (userType === 'student' && studentId) {
      // Verificação adicional: garantir que o studentId é válido
      if (!/^\d+$/.test(studentId)) {
        socket.emit('loginError', { message: 'Número de aluno inválido' });
        return;
      }
      
      users.set(socket.id, { type: 'student', studentId, socketId: socket.id });
      socket.join(`student_${studentId}`);
      socket.emit('loginSuccess', { userType: 'student', studentId });
      
      // Inicializar chat se não existir
      if (!chats.has(studentId)) {
        chats.set(studentId, []);
      }
      
      // Enviar mensagens existentes
      socket.emit('chatHistory', chats.get(studentId));
      
      // Enviar submissões existentes
      const userSubmissions = submissions.get(studentId);
      if (userSubmissions) {
        socket.emit('submissionHistory', userSubmissions);
      }
    } else {
      socket.emit('loginError', { message: 'Dados de login inválidos' });
    }
  });

  // Envio de mensagem no chat
  socket.on('sendMessage', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    const { message, targetStudentId } = data;
    const timestamp = new Date();

    if (user.type === 'student') {
      // Estudante só pode enviar para o seu próprio chat
      const studentId = user.studentId;
      if (!chats.has(studentId)) {
        chats.set(studentId, []);
      }
      
      const chatMessage = {
        message,
        timestamp,
        type: 'student',
        studentId
      };
      
      chats.get(studentId).push(chatMessage);
      
      // Guardar chats no ficheiro
      saveChats();
      
      // Enviar para o próprio estudante e para todos os admins
      socket.emit('newMessage', chatMessage);
      socket.to('admin').emit('newMessage', chatMessage);
      
    } else if (user.type === 'admin' && targetStudentId) {
      // Admin pode enviar para qualquer chat de estudante
      if (!chats.has(targetStudentId)) {
        chats.set(targetStudentId, []);
      }
      
      const chatMessage = {
        message,
        timestamp,
        type: 'admin',
        studentId: targetStudentId
      };
      
      chats.get(targetStudentId).push(chatMessage);
      
      // Guardar chats no ficheiro
      saveChats();
      
      // Enviar para o estudante específico e para todos os admins
      socket.to(`student_${targetStudentId}`).emit('newMessage', chatMessage);
      socket.to('admin').emit('newMessage', chatMessage);
      socket.emit('newMessage', chatMessage);
    }
  });

  // Submissão de exercício
  socket.on('submitExercise', (data) => {
    const user = users.get(socket.id);
    if (!user || user.type !== 'student') return;

    const { exerciseId, code, testResults } = data;
    const studentId = user.studentId;
    
    // Verificar se é um exemplo (não pode ser submetido)
    const exercise = exercises.find(ex => ex.id === exerciseId);
    if (exercise && exercise.isExample) {
      socket.emit('submissionError', { message: 'Exemplos não podem ser submetidos' });
      return;
    }
    
    // Verificar se pode acessar este exercício
    if (!canAccessExercise(studentId, exerciseId)) {
      socket.emit('submissionError', { message: 'Precisa completar o exercício anterior primeiro' });
      return;
    }
    
    const submission = {
      exerciseId,
      code,
      testResults,
      timestamp: new Date(),
      completed: testResults && testResults.allPassed === true
    };
    
    // Armazenar submissão (substituir se já existe)
    if (!submissions.has(studentId)) {
      submissions.set(studentId, []);
    }
    
    const studentSubmissions = submissions.get(studentId);
    
    // Procurar se já existe uma submissão para este exercício
    const existingIndex = studentSubmissions.findIndex(sub => sub.exerciseId === exerciseId);
    
    if (existingIndex !== -1) {
      // Substituir submissão existente
      studentSubmissions[existingIndex] = submission;
      console.log(`Submissão substituída de ${studentId} para exercício ${exerciseId}`);
    } else {
      // Adicionar nova submissão
      studentSubmissions.push(submission);
      console.log(`Nova submissão de ${studentId} para exercício ${exerciseId}`);
    }
    
    // Guardar submissões no ficheiro
    saveSubmissions();
    
    // Notificar admins
    const submissionData = {
      studentId,
      ...submission
    };
    
    socket.to('admin').emit('newSubmission', submissionData);
    socket.emit('submissionSuccess', submission);
    
    console.log(`Submissão recebida de ${studentId} para exercício ${exerciseId}`);
  });

  // Desconexão
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      console.log(`Utilizador desconectado: ${user.type} ${user.studentId || 'admin'}`);
      users.delete(socket.id);
    }
  });
});

// Iniciar servidor
async function startServer() {
  // Carregar dados salvos
  await loadData();
  
  // Iniciar servidor HTTP
  server.listen(PORT, () => {
    console.log(`🚀 Servidor a correr na porta ${PORT}`);
    console.log(`🌐 Acesse: http://localhost:${PORT}`);
    console.log(`💾 Sistema de persistência ativo`);
  });
}

// Graceful shutdown - salvar dados ao encerrar
process.on('SIGINT', async () => {
  console.log('\n🛑 Encerrando servidor...');
  await saveSubmissions();
  await saveChats();
  console.log('💾 Dados guardados com sucesso');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Encerrando servidor...');
  await saveSubmissions();
  await saveChats();
  console.log('💾 Dados guardados com sucesso');
  process.exit(0);
});

startServer();