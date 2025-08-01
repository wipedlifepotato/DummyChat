function htmlEscape(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  
  const { createApp } = Vue;
  
  createApp({
    data() {
      return {
        title: "DummyChat UI",
        buffer: "",
        pubkey: localStorage.getItem("pubkey"),
        privkey: localStorage.getItem("privkey") || "",
        message: "",
        messages: [],
  
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
    async mounted() {
      if (!this.privkey) {
        await this.genKeys();
      }
      await this.restoreSessionsAndSockets();
    },
    methods: {
      async restoreSessionsAndSockets() {
        for (const friend of this.friends) {
          const friendName = friend.name;
          const friendPubKey = friend.pubkey;
  
          if (!this.sessions[friendName]) {
            const sessionId = await this.createSession(friendName, this.privkey);
            if (sessionId) this.sessions[friendName] = sessionId;
          }
  
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
          this.outputSockets[friendName] = socket;
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
            location.reload();
          }
          const combinedBuffer = (inputBuffer || "") + "\r\n" + (outputBuffer || "");
  
          if (!combinedBuffer || combinedBuffer === this.lastBuffer) return;
  
          const newText = combinedBuffer.slice(this.lastBuffer.length);
          this.lastBuffer = combinedBuffer;
  
          const msgs = newText.split("\r\n");
          for (const msg of msgs) {
            if (!msg.trim()) continue;
  
            const msgEscaped = htmlEscape(msg);
  
            this.messages.push({ from: friendName, text: msgEscaped });
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
  
        const sessionId = await this.createSession(friendName, this.privkey);
        if (!sessionId) return alert("Err to add (createSession)");
  
        const sockId = await this.sessionConnect(friendName, friendPubKey);
        if (!sockId) return alert("Err to connect");
  
        this.sessions[friendName] = sessionId;
        this.outputSockets[friendName] = sockId;
        this.acceptSockets[friendName] = await this.sessionAccept(friendName);
  
        await this.setBuffer(sockId, friendName + "_output");
        await this.setBuffer(this.acceptSockets[friendName], friendName + "_input");
  
        this.friends.push({ name: friendName, pubkey: friendPubKey });
        this.saveAllToLocalStorage();
        console.log(`friend added successfully: ${friendName}`);
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
        this.outputSockets[nick] = data.id;
        await this.setBuffer(data.id, nick + "_output");
        this.saveAllToLocalStorage();
        return data.id;
      },
  
      async sessionAccept(nick) {
        const res = await fetch("/api/sam/session-accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nickname: nick }),
        });
        if (!res.ok) {
          alert("Error with session accept");
          return false;
        }
        const data = await res.json();
        this.acceptSockets[nick] = data.id;
        await this.setBuffer(data.id, nick + "_input");
        this.saveAllToLocalStorage();
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
  }).mount("#app");
  