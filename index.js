require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const harperSaveMessage = require('./services/harper-save-message');
const harperGetMessages = require('./services/harper-get-messages');
const leaveRoom = require('./utils/leave-room'); // Add this



const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) {
      // Permite solicitações sem cabeçalho Origin (por exemplo, solicitações de mesma origem, clientes não-navegador)
      callback(null, true);
    } else if ([
      'http://localhost:5173',
      'http://localhost:5173/',
      'http://localhost:5174',
      'http://localhost:5174/',
      'http://localhost:5175',
      'http://localhost:5175/',
      'http://localhost:8081/',  
      'http://localhost:8081',
      'http://localhost:8000/',  
      'http://localhost:8000',
      'https://guerratool.com/',
      'https://guerratool.com',
      'https://qr-code-simples-gd.web.app/',
      'https://qr-code-simples-gd.web.app',
      'https://gd-companion-fm.web.app',
      'https://gd-companion-fm.web.app/',
      'https://gdpayment-mjlrkfgyq9mqzmq5.web.app',
      'https://gdpayment-mjlrkfgyq9mqzmq5.web.app/',
      'https://chatprototypegd.web.app/',
      'https://chatprototypegd.web.app'
    ].includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'baggage', 'sentry-trace'],
  exposedHeaders: ['Content-Length', 'X-Knowledge-Count'],
  credentials: true,
  maxAge: 3600,
  preflightContinue: false,
  optionsSuccessStatus: 204
};


app.use(cors(corsOptions));

// Middleware para adicionar manualmente o cabeçalho Access-Control-Allow-Origin
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*"); // ou o seu domínio específico
  // Adicione outros cabeçalhos que você precisa aqui
  next();
});

const server = http.createServer(app); // Add this

// Create an io server and allow for CORS from http://localhost:3000 with GET and POST methods
const io = new Server(server, {
  cors: { //
    origin: ['*'],
    methods: ['GET', 'POST'],
  },
});

const CHAT_BOT = 'ChatBot';
let chatRoom = ''; // E.g. javascript, node,...
let allUsers = []; // All users in current chat room

// Listen for when the client connects via socket.io-client
io.on('connection', (socket) => {
  console.log(`User connected ${socket.id}`);

 // Evento para lidar com a criação de uma sala de chat individual
 socket.on('create_individual_chat', (data) => {
  const { senderId, receiverId } = data;
  const room = `${senderId}-${receiverId}`;

  // Armazena a sala de chat para futuras referências
  userRooms[room] = true;

  // Junta os usuários à sala de chat individual
  socket.join(room);
});

// Evento para lidar com o envio de uma mensagem para um usuário específico
socket.on('send_individual_message', (data) => {
  const { senderId, receiverId, message } = data;
  const room = `${senderId}-${receiverId}`;

  // Envia a mensagem para a sala de chat individual
  io.to(room).emit('receive_individual_message', { senderId, message });
});



  // Add a user to a room
  socket.on('join_room', (data) => {
    const { username, room } = data; // Data sent from client when join_room event emitted
    socket.join(room); // Join the user to a socket room

    let __createdtime__ = Date.now(); // Current timestamp
    // Send message to all users currently in the room, apart from the user that just joined
    socket.to(room).emit('receive_message', {
      message: `${username} has joined the chat room`,
      username: CHAT_BOT,
      __createdtime__,
    });
    // Send welcome msg to user that just joined chat only
    socket.emit('receive_message', {
      message: `Welcome ${username}`,
      username: CHAT_BOT,
      __createdtime__,
    });
    // Save the new user to the room
    chatRoom = room;
    allUsers.push({ id: socket.id, username, room });
    chatRoomUsers = allUsers.filter((user) => user.room === room);
    socket.to(room).emit('chatroom_users', chatRoomUsers);
    socket.emit('chatroom_users', chatRoomUsers);

    // Get last 100 messages sent in the chat room
    harperGetMessages(room)
      .then((last100Messages) => {
        // console.log('latest messages', last100Messages); 
        socket.emit('last_100_messages', last100Messages);
      })
      .catch((err) => console.log(err));
  });

  socket.on('send_message', (data) => {
    const { message, username, room, __createdtime__ } = data;
    io.in(room).emit('receive_message', data); // Send to all users in room, including sender
    harperSaveMessage(message, username, room, __createdtime__) // Save message in db
      .then((response) => console.log(response))
      .catch((err) => console.log(err));
  });

  socket.on('leave_room', (data) => {
    const { username, room } = data;
    socket.leave(room);
    const __createdtime__ = Date.now();
    // Remove user from memory
    allUsers = leaveRoom(socket.id, allUsers);
    socket.to(room).emit('chatroom_users', allUsers);
    socket.to(room).emit('receive_message', {
      username: CHAT_BOT,
      message: `${username} has left the chat`,
      __createdtime__,
    });
    console.log(`${username} has left the chat`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected from the chat');
    const user = allUsers.find((user) => user.id == socket.id);
    if (user?.username) {
      allUsers = leaveRoom(socket.id, allUsers);
      socket.to(chatRoom).emit('chatroom_users', allUsers);
      socket.to(chatRoom).emit('receive_message', {
        message: `${user.username} has disconnected from the chat.`,
      });
    }
  });
});

server.listen(4001, () => 'Server is running on port 4001');
