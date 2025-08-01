function htmlEscape(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const { createApp } = Vue

  createApp({
    data() {
      return {
        title: 'DummyChat UI',
        buffer: '',
        pubkey: localStorage.getItem('pubkey'),
        privkey: localStorage.getItem('privkey') || '',
        message: '',
        messages: [],
        sessions: {},
        friends: JSON.parse(localStorage.getItem('friends')) || [],
        acceptSockets: {},
        outputSockets: {},
        nickname: 'You',
        msgParserInterval: false,
        selectedFriend: '',
        mainInputSocket: {}
      }
    },
    async mounted() {
      this.initSessions().then( () => {
        console.log(`session inited`)
      })
    },
    methods: {
      async mainInputStreamSet() {
        if (this.msgParserInterval) clearInterval(this.msgParserInterval);
        this.lastBuffer = '';

          this.msgParserInterval = setInterval(async () => {
            const buffer = await this.fetchBuffers('mainInputSocket');
            
            if (!buffer || buffer === this.lastBuffer) return; 

            const msgs = buffer.slice(this.lastBuffer.length).split("\r\n");
            this.lastBuffer = buffer;

            for (const msg of msgs) {
              if (!msg.trim()) continue;
              const msgEscaped = htmlEscape(msg);
              this.messages.push({ from: friendName, text: msgEscaped });
            }
            this.buffer = this.messages.map(m => `${m.from}: ${m.text}`).join("\r\n");
          }, 2500);        },
      async initSessions() {
        if (this.privkey) {
          const data = await this.createSession('mainInputSocket', this.privkey);
          this.sessions['mainInputSocket'] = data;
          this.selectedFriend = 'mainInputSocket'
          const acceptSocket = await this.sessionAccept('mainInputSocket');
          this.mainInputSocket = acceptSocket;
          await this.setBuffer(this.mainInputSocket, 'mainInputSocket');
          
        }

        for (const friend of this.friends) {
          if (!this.sessions[friend.name]) {
            console.log(`init session`);
            const data = await this.createSession(friend.name, this.privkey);
            if (!data) {
              console.log(`session exists already`);
            } else {
              this.sessions[friend.name] = data;
            }
          }
          const acceptSocket = await this.sessionAccept(friend.name);
          this.acceptSockets[friend.name] = acceptSocket; // БЫЛА ОШИБКА: friendName → friend.name
        }
      },
      async selectFriend(friendName, pubkey) {
        if (!this.sessions[friendName])
        {
          const res = await this.createSession(friendName, this.privkey)
          if(res) this.sessions[friendName] = res
          else console.log(`session exists already`)
          //if(!res) alert("can't create session")
        }
        console.log(`friend name: ${friendName}`)
        let socket = this.outputSockets[friendName] || this.acceptSockets[friendName];
        if(!socket) 
        {
          socket = await this.sessionConnect(friendName, pubkey)
          if(! socket ) {
            alert("Can't reach friend")
            return false
          } 
        }
        console.log(`socket: ${socket}`)
        const res = await this.setBuffer(socket, friendName);

        if (!res) {
           alert("error to select friend");
           return false
        }

        if (this.msgParserInterval) clearInterval(this.msgParserInterval);
        this.lastBuffer = '';

          this.msgParserInterval = setInterval(async () => {
            const buffer = await this.fetchBuffers(friendName);
            
            if (!buffer || buffer === this.lastBuffer) return; 

            const msgs = buffer.slice(this.lastBuffer.length).split("\r\n");
            this.lastBuffer = buffer;

            for (const msg of msgs) {
              if (!msg.trim()) continue;
              const msgEscaped = htmlEscape(msg);
              this.messages.push({ from: friendName, text: msgEscaped });
            }
            this.buffer = this.messages.map(m => `${m.from}: ${m.text}`).join("\r\n");
          }, 2500);
        this.selectedFriend = friendName
      },
      async delFriend(friendName) {

        this.friends = this.friends.filter(f => f.name !== friendName);
        localStorage.setItem('friends', JSON.stringify(this.friends));
        delete this.sessions[friendName];
        delete this.outputSockets[friendName];
        delete this.acceptSockets[friendName];
        console.log(`${friendName} was delete`);
      },
      async addFriend() {
        const friendName = document.getElementById('friendName').value
        const friendPubKey = document.getElementById('friendPubKey').value
        if(!this.privkey) {
          await this.genKeys();
        }
        const sessionId = await this.createSession(friendName, this.privkey)
        if(!sessionId) return alert("Err to add (createSession)")
        const sockId = await this.sessionConnect(friendName, friendPubKey);
        if (!sockId) return alert("Err to connect")
        this.sessions[friendName] = sessionId
        this.outputSockets[friendName] = sockId
        this.friends.push({name: friendName, pubkey: friendPubKey})
        localStorage.setItem('friends', JSON.stringify(this.friends))
        console.log(`friend add succesfully ${this.friends}`)
      },
      async sendMessage() {
        const messageText = document.getElementById('messageText')
        const _data = messageText.value
        const receiver = this.selectedFriend
        if (!receiver) return alert("Выберите получателя")
        const socket = this.outputSockets[receiver] || this.acceptSockets[receiver];
        const res = await fetch('/api/sam/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sockId: socket, data: _data+"\r\n\r\n" })
          });           
          if (!res.ok) {
            return alert("err to send")
          }
          this.messages.push({ from: this.nickname, text: _data });
          return true;
      },
      async sessionConnect(nick, dest) {
        const res = await fetch('/api/sam/session-connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname: nick, destination: dest })
          });           
          if (!res.ok) {
            console.log ( await res.json() )
            return false
          }
          const data = await res.json()
          this.outputSockets[nick] = data.id
          return data.id
      },
      async sessionAccept(nick) {
        const res = await fetch('/api/sam/session-accept', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname: nick })
          });
          if (!res.ok) {
              return alert("err with session create")
          }
          const data = await res.json()
          this.acceptSockets[nick] = data.id
          return data.id
      },
      async createSession(nick, privkey=false) {
          if (this.sessions[nick]){
            //return alert("session exists")
            return;
          }
          const key = privkey ? privkey : localStorage.getItem('privkey')
          if (!key) {
            return alert("Generate keys first")
          }
          const res = await fetch('/api/sam/session-create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname: nick, privkey: key })
          });
          if (!res.ok) {
            console.log ( await res.json() )
            return false
          }
          console.log(`return data`)
          const data = await res.json();
          this.sessions[nick] = data.id
          return data.id
      },
      async genKeys() {
        const res = await fetch('/api/sam/generateDestination/7')
        if(res.ok)
        {
          const pubKeyInput = document.getElementById('pubKey')
          const data = await res.json();
          console.log(data)
          pubKeyInput.value = data.pubkey
          localStorage.setItem('privkey', data.privkey);
          localStorage.setItem('pubkey', data.pubkey);
          privkey = data.privkey
          pubkey = data.pubkey
        } else alert("Err")
      },
      async clearSockets() {
        const res = await fetch('/api/sam/clear')
        if (res.ok) console.log(`cleared`)
        else alert("Err")
      },
      async setSAM() {
          const SAMHost = document.getElementById('samHOST').value
          const SAMPORT = document.getElementById('samPORT').value
          const res = await fetch('/api/sam/setSAM', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host: SAMHost, port: SAMPORT })
          });
          if (!res.ok) return alert("Err")

          const json = await res.json();
          console.log('setSAM result:', json);            
      },
      async setBuffer(id, bName) {
        console.log(`id: ${id}, bufname: ${bName}`)
        try {
          const res = await fetch('/api/sam/setBuffer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sockId: id, bufName: bName })
          });

          if (!res.ok) {
            alert("err to set buffer: " + res.statusText);
            return false;
          }

          return true;
        } catch (err) {
          console.error("Ошибка запроса к /api/sam/setBuffer:", err);
          alert("Ошибка сети или сервера при setBuffer");
          return false;
        }
      },
      async fetchBuffers(buffer) {
        const res = await fetch(`/api/sam/getBuffer/${buffer}`);
        const json = await res.json();
        this.buffer = json.buffer
        return this.buffer
      }
    }
  }).mount('#app')