'use strict';
const express = require('express');
const path = require('path');
const { createServer } = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');

const app = express();
app.use(express.static(path.join(__dirname, '/public')));
const server = createServer(app);
const wss = new WebSocket.Server({ server, clientTracking : true });

const whiteboards = {};

function updateDisplayObject(whiteboardId, updateTypes, objectData) {
	// All is a full object sync
	if(updateTypes.indexOf('all') != -1) {
		// New or fully updated
		whiteboards[whiteboardId][objectData.id] = objectData;
	}
	else {
		if(objectData.id in whiteboards[whiteboardId] && objectData.rev >= whiteboards[whiteboardId][objectData.id].rev) {
			// update revision
			whiteboards[whiteboardId][objectData.id].rev = objectData.rev;
			updateTypes.forEach(function update(updateType) {
				switch(updateType) {
					case 'color':
						whiteboards[whiteboardId][objectData.id].color = objectData.color;
					break;
					case 'weight':
						whiteboards[whiteboardId][objectData.id].weight = objectData.weight;
					break;
					case 'rect':
						whiteboards[whiteboardId][objectData.id].rect = objectData.rect;
					break;
					case 'dataAdd':
						whiteboards[whiteboardId][objectData.id].data.concat(objectData.data);
					break;
					case 'dataMod':
						whiteboards[whiteboardId][objectData.id].data = objectData.data;
					break;
				}
			});
		}
		// Older revision, discard
		else if(objectData.id in whiteboards[whiteboardId]) {
			console.log("WARN: Recieved old revision");
		}
		// Object doesn't exist, send sync request
		else {
			console.log("WARN: No object exists for update");
		}
	}
	fs.writeFileSync('./whiteboards' + whiteboardId + '.json', JSON.stringify(whiteboards[whiteboardId]));
}

wss.on('connection', function connection(ws, request) {
	// Store whiteboard id to connection
	// console.log(request.url);
    ws.whiteboardId = request.url;
	// Existing whiteboard dump to client on connect
	if(request.url in whiteboards) {
		let objectData = [];
		for(var id in whiteboards[request.url]) {
			objectData.push(whiteboards[request.url][id]);
		}
		if(objectData.length > 0) {
			ws.send(JSON.stringify({
				'action' : 'update',
				'types' : 'all',
				'objectData' : objectData
			}));
		}
	}
	// New whiteboard id
	else {
		whiteboards[request.url] = {};
	}

	ws.on('message', function incoming(message) {
		var msgObj = JSON.parse(message.toString());
		// Update local store
		switch(msgObj.action) {
			// Update or add object(s)
			case 'update':
				msgObj.objectData.forEach(function updateObject(objectData) {
					updateDisplayObject(request.url, msgObj.types, objectData);
				});
			break;
			// Delete object(s)
			case 'delete':
				msgObj.objectData.forEach(function deleteObject(id) {
					delete whiteboards[request.url][id];
				});
			break;
		}

		// Forward to clients that aren't the sender
		wss.clients.forEach(function broadcase(client) {
			if(client.whiteboardId == request.url && client != ws)
				client.send(message.toString());
		});
	});
});

fs.readdirSync('./whiteboards/').forEach(file => {
	if(file.endsWith('.json')) {
		whiteboards['/' + file.slice(0, -5)] = JSON.parse(fs.readFileSync('./whiteboards/' + file));
	}
});

server.listen(8081, function() {
   var ifaces = os.networkInterfaces();
   Object.keys(ifaces).forEach(function (ifname) {
     ifaces[ifname].forEach(function (iface) {
      if ('IPv4' !== iface.family) {
        // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
        return;
      }
      console.log("Listening on http://" + iface.address + ":8081/whiteboard.html");
    });
  });
});