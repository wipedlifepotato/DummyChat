function htmlEscape(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  
  const { createApp } = Vue;
  const { createI18n } = VueI18n

  const messages = {
    en: {
      title: 'DummyChat UI',
      send: 'Send',
      selectFriend: 'Select a friend',
      friends: 'Friends',
      del: 'delete',
      addFriend: 'Add friend',
      friendName: 'Nickname of friend',
      friendPubKey: 'Pubkey of friend',
      hostSAM: 'host SAM',
      portSAM: 'port SAM',
      genKeys: "generate keys",
      pubkey: "public key",
      clearSockets: "clear all sockets",
      set: "set",
      SAMSettings: "Settings of SAM protocol"
    },
    ru: {
      title: 'DummyChat UI',
      send: 'Отправить',
      selectFriend: 'Выберите друга',
      friends: 'Друзья',
      del: 'удалить',
      addFriend: 'Добавить друга',
      friendName: 'Никнейм друга',
      friendPubKey: 'Публичный ключ друга',
      hostSAM: 'Хост SAM',
      portSAM: 'Порт SAM',
      genKeys: "Сгенерировать ключи",
      pubkey: "публичный ключ",
      clearSockets: "очистить сокеты",
      set: "установить",
      SAMSettings: "Настройки SAM"
    }
  }

  const i18n = createI18n({
    locale: 'en', 
    fallbackLocale: 'en',
    messages,
  })
  createApp({
    data() {
      return {
        title: "DummyChat UI",
        buffer: "",
        newFriendName: '',
        newFriendPubkey: '',
        pubkey: localStorage.getItem("pubkey"),
        privkey: localStorage.getItem("privkey") || "",
        message: "",
        messages: [],
        locale: 'en',
        sessions: JSON.parse(localStorage.getItem("sessions")) || {},
        friends: JSON.parse(localStorage.getItem("friends")) || [],
  
        acceptSockets: JSON.parse(localStorage.getItem("acceptSockets")) || {},
        outputSockets: JSON.parse(localStorage.getItem("outputSockets")) || {},
  
        nickname: "You",
        msgParserInterval: null,
        selectedFriend: "",
        lastBuffer: "",
      };
    },
    watch: {
        locale(newLocale) {
          this.$i18n.locale = newLocale;
        }
    },
    async mounted() {
      if (!this.privkey) {
        await this.genKeys();
      }
      await this.getSockets();

      this.socketsInterval = setInterval(() => {
        this.getSockets();
      }, 2500);
      await this.restoreSessionsAndSockets();
    },
    methods: {
      changeLocale() {
            this.$i18n.locale = this.locale;
            document.title = this.$t('title');
            this.emit()
      },
      async restoreSessionsAndSockets() {
        for (const friend of this.friends) {
          const friendName = friend.name;
          const friendPubKey = friend.pubkey;
  
          const sessionId = await this.createSession(friendName, this.privkey);
          if (sessionId) this.sessions[friendName] = sessionId;
          
  
          if (!this.acceptSockets[friendName]) {
            const acceptId = await this.sessionAccept(friendName);
            if (acceptId) {
              this.acceptSockets[friendName] = acceptId;
              await this.setBuffer(acceptId, friendName + "_input");
            }
          }
  
          if (!this.outputSockets[friendName]) {
            const connectId = await this.sessionConnect(friendName, friendPubKey);
            if (connectId) {
              this.outputSockets[friendName] = connectId;
              await this.setBuffer(connectId, friendName + "_output");
            }
          }
        }
  
        this.saveAllToLocalStorage();
  
        if (this.friends.length > 0) {
          this.selectFriend(this.friends[0].name, this.friends[0].pubkey);
        }
      },
      setFriendDirection(name, dir) {
        const friend = this.friends.find(f => f.name === name);
        if (friend) {
          friend.direction = dir;
        }
      },
      saveAllToLocalStorage() {
        localStorage.setItem("sessions", JSON.stringify(this.sessions));
        localStorage.setItem("acceptSockets", JSON.stringify(this.acceptSockets));
        localStorage.setItem("outputSockets", JSON.stringify(this.outputSockets));
        localStorage.setItem("friends", JSON.stringify(this.friends));
      },
  
      async selectFriend(friendName, pubkey) {
        this.selectedFriend = friendName;
  
        if (!this.sessions[friendName]) {
          const sessionId = await this.createSession(friendName, this.privkey);
          if (sessionId) this.sessions[friendName] = sessionId;
        }
  
        let socket = this.outputSockets[friendName] || this.acceptSockets[friendName];
        if (!socket) {
          socket = await this.sessionConnect(friendName, pubkey);
          if (!socket) {
            alert("Can't reach friend");
            return false;
          }
          if(!this.outputSockets[friendName]) this.outputSockets[friendName] = socket;
          await this.setBuffer(socket, friendName + "_output");
        }
  
        if (this.msgParserInterval) clearInterval(this.msgParserInterval);
        this.lastBuffer = "";
        this.messages = [];
  
        this.msgParserInterval = setInterval(async () => {
          const inputBuffer = await this.fetchBuffers(friendName + "_input");
          const outputBuffer = await this.fetchBuffers(friendName + "_output");
          if (inputBuffer === false && outputBuffer === false) {
            const acceptSockets = JSON.parse(localStorage.getItem('acceptSockets') || '{}');
            const outputSockets = JSON.parse(localStorage.getItem('outputSockets') || '{}');
            const sessions = JSON.parse(localStorage.getItem('sessions') || '{}');
          
            delete acceptSockets[friendName];
            delete outputSockets[friendName];
            delete sessions[friendName];
          
            localStorage.setItem('acceptSockets', JSON.stringify(acceptSockets));
            localStorage.setItem('outputSockets', JSON.stringify(outputSockets));
            localStorage.setItem('sessions', JSON.stringify(sessions));
          
            delete this.acceptSockets[friendName];
            delete this.outputSockets[friendName];
            delete this.sessions[friendName];
          
            console.log(`Sockets and sessions for ${friendName} removed due to empty buffers.`);
            //location.reload();
          }
          const combinedBuffer = (inputBuffer || "") + "\r\n" + (outputBuffer || "");
  
          if (!combinedBuffer || combinedBuffer === this.lastBuffer) return;
  
          const newText = combinedBuffer.slice(this.lastBuffer.length);
          this.lastBuffer = combinedBuffer;
  
          const msgs = newText.split("\r\n");
          for (const msg of msgs) {
            if (!msg.trim()) continue;
        
            let skip = false;
            try {
              const parsed = JSON.parse(msg);
              if (parsed && parsed.pubkey) {
                skip = true; 
              }
            } catch (e) {
            }
        
            if (!skip) {
              const msgEscaped = htmlEscape(msg);
              this.messages.push({ from: friendName, text: msgEscaped });
            }
          }
        }, 1500);
  
        return true;
      },
  
      async addFriend() {
       const friendName = document.getElementById("friendName").value.trim();
        const friendPubKey = document.getElementById("friendPubKey").value.trim();
        if (!friendName || !friendPubKey) {
          return alert("Введите имя и pubkey друга");
        }
        if (!this.privkey) await this.genKeys();

        this.friends.push({ name: friendName, pubkey: friendPubKey });
        this.saveAllToLocalStorage();
        console.log(`friend added successfully: ${friendName}`);
        location.reload();
      },
  
      async delFriend(friendName) {
        this.friends = this.friends.filter((f) => f.name !== friendName);
        delete this.sessions[friendName];
        delete this.outputSockets[friendName];
        delete this.acceptSockets[friendName];
        this.saveAllToLocalStorage();
        console.log(`${friendName} was deleted`);
      },
  
      async sendMessage() {
        if (!this.selectedFriend) return alert("Выберите получателя");
  
        const messageText = document.getElementById("messageText");
        const _data = messageText.value.trim();
        if (!_data) return;
  
        const receiver = this.selectedFriend;
        const socket = this.outputSockets[receiver] || this.acceptSockets[receiver];
        if (!socket) return alert("Socket not found for sending");
  
        const res = await fetch("/api/sam/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sockId: socket, data: "  "+_data + "\r\n" }),
        });
  
        if (!res.ok) return alert("Error sending message");
  
        this.messages.push({ from: this.nickname, text: _data });
        messageText.value = "";
        return true;
      },
      async getSockets() {
        try {
          const res = await fetch('/api/sam/sockets');
          if (!res.ok) throw new Error("Failed to fetch sockets");
          const data = await res.json();
      
          for (const sock of data.sockets) {
            const fr = this.friends.filter(f => f.pubkey === sock.friendPubKey);
            if (fr.length > 0) {
              const friend = fr[0];
              this.outputSockets[friend.name] = sock.id;
              this.acceptSockets[friend.name] = sock.id;
              this.saveAllToLocalStorage();
            }
          }
        } catch (e) {
          console.error("Error in getSockets:", e);
        }
      },      
      async sessionConnect(nick, dest) {
        const res = await fetch("/api/sam/session-connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nickname: nick, destination: dest }),
        });
        if (!res.ok) {
          console.log(await res.json());
          return false;
        }
        const data = await res.json();
        if(!this.outputSockets[nick]) {
           this.outputSockets[nick] = data.id;
           this.setFriendDirection(nick, 'out');
        }
        await this.setBuffer(data.id, nick + "_output");
        this.saveAllToLocalStorage();
        const res1 = await fetch("/api/sam/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sockId: data.id, data: JSON.stringify({pubkey: this.pubkey}) }),
        });
        return data.id;
      },
  
      async sessionAccept(nick) {
        const res = await fetch("/api/sam/session-accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nickname: nick }),
        });
        if (!res.ok) {
          //alert("Error with session accept");
          return false;
        }
        const data = await res.json();
        if(!this.acceptSockets[nick]){ 
          this.acceptSockets[nick] = data.id;
          this.setFriendDirection(nick, 'in');
        }
        await this.setBuffer(data.id, nick + "_input");
        this.saveAllToLocalStorage();
        const res1 = await fetch("/api/sam/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sockId: data.id, data: JSON.stringify({pubkey: this.pubkey}) }),
        });
        return data.id;
      },
  
      async createSession(nick, privkey = false) {
        if (this.sessions[nick]) return;
  
        const key = privkey ? privkey : localStorage.getItem("privkey");
        if (!key) {
          alert("Generate keys first");
          return false;
        }
  
        const res = await fetch("/api/sam/session-create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nickname: nick, privkey: key }),
        });
        if (!res.ok) {
          console.log(await res.json());
          return false;
        }
        const data = await res.json();
        this.sessions[nick] = data.id;
        this.saveAllToLocalStorage();
        return data.id;
      },
  
      async genKeys() {
        const res = await fetch("/api/sam/generateDestination/7");
        if (res.ok) {
          const data = await res.json();
          localStorage.setItem("privkey", data.privkey);
          localStorage.setItem("pubkey", data.pubkey);
          this.privkey = data.privkey;
          this.pubkey = data.pubkey;
  
          const pubKeyInput = document.getElementById("pubKey");
          if (pubKeyInput) pubKeyInput.value = data.pubkey;
        } else {
          alert("Error generating keys");
        }
      },
  
      async setBuffer(id, bName) {
        try {
          const res = await fetch("/api/sam/setBuffer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sockId: id, bufName: bName }),
          });
          if (!res.ok) {
            alert("Error setting buffer: " + res.statusText);
            return false;
          }
          return true;
        } catch (err) {
          console.error("Error in setBuffer:", err);
          alert("Network/server error in setBuffer");
          return false;
        }
      },
  
      async fetchBuffers(bufferName) {
        try {
          const res = await fetch(`/api/sam/getBuffer/${bufferName}`);
          if (!res.ok) return false;
  
          const json = await res.json();
          return json.buffer || "";
        } catch {
          return "";
        }
      },
    },
  }).use(i18n).mount("#app");
  