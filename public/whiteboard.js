class Whiteboard {
	constructor(host, guid) {
		// All whiteboard display objects by id
		this.displayObjects = {};
		// Currently selected object ids
		this.selectedObjects = [];
		// Active object by id
		this.activeObject = null;
		// Image object cache for display
		this.imageCache = {};

		// Current tool
		this.toolOptions = ['pointer', 'marker', 'line', 'rectangle', 'circle', 'text']
		this.currentTool = 'pointer';
		this.currentWeight = 4;
		this.colorOptions = ['black', 'blue', 'red', 'green', 'orange', 'purple', 'pink', 'brown'];
		this.currentColor = 'black';

		// Settings
		this.maxImageSize = 400;
		this.maxWeight = 30;

		// Debug info flag
		this.showDebugInfo = false;

		// Defines a viewport
		this.viewportScale = 1.0;
		this.viewportSize = null;
		this.viewportEdge = null;
		this.origViewportEdge = null;

		// Key and mouse state tracking
		this.isCtrlDown = false;
		this.isShiftDown = false;
		this.isMouseDown = false;

		// Grab position tracking
		this.grabPos = null;
		this.mousePos = null;

		// Current user id
		this.uid = 1;

		// Temp for testing
		this.curId = 1;

		if(host && guid) {
			// Hostname and GUID for this whiteboard
			this.guid = guid;
			this.host = host;
			// Actual communciation socket
			this.socket = null;
			// Socket is open
			this.isSocketOpen = false;
			// Queue for messages when socket is closed
			this.msgQueue = [];
			// Attempt to connect to the remote server
			this.establishConnection();
		}
	}

	dumpJSON() {
		var dumpObj = {
			host : this.host,
			guid : this.guid,
			displayObjects: []
		};
		for(var id in this.displayObjects) {
			dumpObj.displayObjects.push(this.displayObjects[id]);
		}
		console.log(JSON.stringify(dumpObj));
	}

	saveImage(canvas) {
		// Find actual whiteboard bounds
		var minX = 0;
		var maxX = 0;
		var minY = 0;
		var maxY = 0;
		for(var id in this.displayObjects) {
			var displayObject = this.displayObjects[id];
			var fixedRect = [displayObject.rect[0], displayObject.rect[1], displayObject.rect[2], displayObject.rect[3]];
			if(fixedRect[0] > fixedRect[2]) {
				var temp = fixedRect[0];
				fixedRect[0] = fixedRect[2];
				fixedRect[2] = temp;
			}
			if(fixedRect[1] > fixedRect[3]) {
				var temp = fixedRect[1];
				fixedRect[1] = fixedRect[3];
				fixedRect[3] = temp;
			}
			// weight buffer
			if(displayObject.weight) {
				fixedRect[0] -= displayObject.weight;
				fixedRect[1] -= displayObject.weight;
				fixedRect[2] += displayObject.weight;
				fixedRect[3] += displayObject.weight;
			}
			if(fixedRect[0] < minX) minX = fixedRect[0];
			if(fixedRect[1] < minY) minY = fixedRect[1];
			if(fixedRect[2] > maxX) maxX = fixedRect[2];
			if(fixedRect[3] > maxY) maxY = fixedRect[3];
		}
		var tempCanvas = document.createElement('canvas');
		tempCanvas.width = Math.abs(maxX - minX);
		tempCanvas.height = Math.abs(maxY - minY);
		var tempContext = tempCanvas.getContext('2d');

		for(var id in this.displayObjects) {
			this.renderDisplayObjectRelative(tempContext, id, [minX, minY])
		}

		return tempCanvas.toDataURL('image/png');
	}

	// Sets or adjusts the viewport size
	resizeViewport(width, height) {
		// Existing edge
		if(this.viewportEdge) {
			// Adjust for new size to maintain center
			this.viewportEdge = [this.viewportEdge[0] + (this.viewportSize[0] - width), this.viewportEdge[1] + (this.viewportSize[1] - height)];
		}
		else {
			// Center viewport
			this.viewportEdge = [-1 * (width * 0.5), -1 * (height * 0.5)];
		}
		this.viewportSize = [width, height];
	}

	// Helper function to convert local coordinates to viewport coordinates
	localToViewport(coords, edge) {
		var viewportCoords = [];
		var viewportEdgeActual = edge ? edge : this.viewportEdge;
		for(var i = 0; i < coords.length; i++) {
			viewportCoords.push((coords[i] - viewportEdgeActual[i % 2]) * this.viewportScale);
		}
		return viewportCoords;
	}
	// Helper function to convert viewport coordinates to local coordinates
	viewportToLocal(coords) {
		var localCoords = [];
		for(var i = 0; i < coords.length; i++) {
			localCoords.push((coords[i] + this.viewportEdge[i % 2]) / this.viewportScale);
		}
		return localCoords;
	}

	// Render visible objects within the viewport
	renderViewport(ctx) {
		var visibleCount = 0;
		var complexityCount = 0;

		// Check all display objects for those within the viewport
		for(var id in this.displayObjects) {
			var displayObject = this.displayObjects[id];
			// Fix bounding rects since active objects that rely on rect for drawing may be reversed
			var fixedRect = [displayObject.rect[0], displayObject.rect[1], displayObject.rect[2], displayObject.rect[3]];
			if(fixedRect[0] > fixedRect[2]) {
				var temp = fixedRect[0];
				fixedRect[0] = fixedRect[2];
				fixedRect[2] = temp;
			}
			if(fixedRect[1] > fixedRect[3]) {
				var temp = fixedRect[1];
				fixedRect[1] = fixedRect[3];
				fixedRect[3] = temp;
			}
			// Check for visible
			if(fixedRect[0] < this.viewportEdge[0] + this.viewportSize[0] &&
			   fixedRect[2] > this.viewportEdge[0] &&
			   fixedRect[1] < this.viewportEdge[1] + this.viewportSize[1] &&
			   fixedRect[3] > this.viewportEdge[1]) {
				visibleCount++;
				if('data' in displayObject && displayObject.type != 'image')
					complexityCount += displayObject.data.length;
				else
					complexityCount += 1;
				this.renderDisplayObject(ctx, id);
			}
		}

		// Render selection area
		if(this.currentTool == 'pointer' && this.isCtrlDown && this.grabPos) {
			ctx.strokeStyle = 'black';
			ctx.lineWidth = 2;
			ctx.setLineDash([4, 4]);
			ctx.strokeRect(this.grabPos[0], this.grabPos[1], this.mousePos[0] - this.grabPos[0], this.mousePos[1] - this.grabPos[1]);
			ctx.setLineDash([]);
		}

		ctx.fillStyle = 'rgba(192, 192, 192, 0.5)';
		ctx.fillRect(0, 0, this.viewportSize[0], 30);

		// Render UI
		for(var i = 0; i < this.colorOptions.length; i++) {
			ctx.strokeStyle = 'black';
			ctx.fillStyle = this.colorOptions[i];
			ctx.lineWidth = 1;
			ctx.fillRect(4 + i * 30, 4, 22, 22);
			ctx.strokeRect(4 + i * 30, 4, 22, 22);
			if(this.colorOptions[i] == this.currentColor) {
				ctx.lineWidth = 2;
				ctx.strokeRect(2 + i * 30, 2, 26, 26);
			}
		}
		var offset = 4 + this.colorOptions.length * 30;
		ctx.beginPath();
		ctx.lineWidth = 1;
		ctx.arc(offset + 11, 15, 11, 11, 0, Math.PI * 2);
		ctx.lineWidth = 2;
		ctx.moveTo(offset + 4, 15);
		ctx.lineTo(offset + 18, 15);
		ctx.stroke();
		offset += 22 + 4;
		ctx.font = '10pt Helvetica';
		ctx.fillStyle = 'black';
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'center';
		ctx.fillText("Weight: " + this.currentWeight, offset + 35, 15);
		offset += 74;
		ctx.beginPath();
		ctx.lineWidth = 1;
		ctx.arc(offset + 11, 15, 11, 11, 0, Math.PI * 2);
		ctx.lineWidth = 2;
		ctx.moveTo(offset + 4, 15);
		ctx.lineTo(offset + 18, 15);
		ctx.moveTo(offset + 11, 8);
		ctx.lineTo(offset + 11, 22);
		ctx.stroke();
		offset += 22 + 8;
		for(var i = 0; i < this.toolOptions.length; i++) {
			ctx.strokeStyle = 'black';
			ctx.lineWidth = 1;
			ctx.strokeRect(offset + 4 + i * 30, 4, 22, 22);
			var img = document.getElementById(this.toolOptions[i]);
			if(img) {
				ctx.drawImage(img, 0, 0, img.width, img.height, offset + 6 + i * 30, 6, 18, 18);
			}
			if(this.toolOptions[i] == this.currentTool) {
				ctx.lineWidth = 2;
				ctx.strokeRect(offset + 2 + i * 30, 2, 26, 26);
			}
		}
		ctx.strokeStyle = 'black';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(0, 30);
		ctx.lineTo(this.viewportSize[0], 30);
		ctx.stroke();

		// Render debug info last to ensure on top
		if(this.showDebugInfo) {
			var viewportCoords = this.localToViewport([0,0]);
			ctx.font = '8pt Helvetica';
			ctx.textBaseline = 'top';
			ctx.textAlign = 'left';
			ctx.fillStyle = 'black';
			// Render centerpoint crosshair if within viewport
			if(viewportCoords[0] >= -20 &&
			   viewportCoords[0] <= this.viewportSize[0] + 20 &&
			   viewportCoords[1] >= -20 &&
			   viewportCoords[1] <= this.viewportSize[1] + 20) {
				ctx.strokeStyle = 'black';
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.moveTo(viewportCoords[0] - 20, viewportCoords[1])
				ctx.lineTo(viewportCoords[0] + 20, viewportCoords[1]);
				ctx.moveTo(viewportCoords[0], viewportCoords[1] - 20)
				ctx.lineTo(viewportCoords[0], viewportCoords[1] + 20);
				ctx.stroke();
				ctx.fillText('0, 0', viewportCoords[0] + 4, viewportCoords[1] + 4);
			}

			ctx.fillStyle = 'rgba(192, 192, 192, 0.5)';
			ctx.fillRect(0, 30, 180, 140);
			ctx.fillStyle = 'black';
			// Always render debug text, upper left
			ctx.fillText('###DEBUG###', 4, 34);
			ctx.fillText('Render Edge: [' + this.viewportEdge[0] + ', ' + this.viewportEdge[1] + ']', 4, 46);
			ctx.fillText('Render Area: [' + this.viewportSize[0] + ', ' + this.viewportSize[0] + ']', 4, 58);
			ctx.fillText('Scale: ' + this.viewportScale, 4, 70);
			ctx.fillText('Visible Objects: ' + visibleCount, 4, 82);
			ctx.fillText('Complexity: ' + complexityCount, 4, 94);
			ctx.fillText('Selected: ' + this.selectedObjects.length, 4, 106);
			ctx.fillText('Tool: ' + this.currentTool + ', Weight: ' + this.currentWeight, 4, 118);
			ctx.fillText('Click: ' + (this.isMouseDown ? 'Yes' : 'No') + ' Ctrl: ' + (this.isCtrlDown ? 'Yes' : 'No') + ' Shift: ' + (this.isShiftDown ? 'Yes' : 'No'), 4, 130);
			ctx.fillText('Grab: ' + (this.grabPos ? ('[' + this.grabPos[0] + ', ' + this.grabPos[1] + ']') : 'none'), 4, 142);
			ctx.fillText('Mouse: ' + (this.mousePos ? ('[' + this.mousePos[0] + ', ' + this.mousePos[1] + ']') : 'none'), 4, 154);
		}
	}

	renderDisplayObject(ctx, id) {
		var displayObject = this.displayObjects[id];

		// Bounding rect to viewport
		var viewportCoords = this.localToViewport(displayObject.rect);

		// If selected then render selection box with buffer
		if(this.selectedObjects.indexOf(id) != -1) {
			ctx.strokeStyle = 'black';
			ctx.lineWidth = 2;
			ctx.setLineDash([4, 4]);
			var bufferSize = 4 + ((displayObject.weight ? displayObject.weight : 0) / 2);
			ctx.strokeRect(viewportCoords[0] - bufferSize,
			               viewportCoords[1] - bufferSize,
						   (viewportCoords[2] - viewportCoords[0]) + (bufferSize * 2),
						   (viewportCoords[3] - viewportCoords[1]) + (bufferSize * 2));
			ctx.setLineDash([]);
		}

		this.renderDisplayObjectRelative(ctx, id, this.viewportEdge)
	}

	renderDisplayObjectRelative(ctx, id, edge) {
		var displayObject = this.displayObjects[id];
		// Bounding rect to viewport
		var viewportCoords = this.localToViewport(displayObject.rect, edge);

		switch(displayObject.type) {
			case 'image':
				// Cache image object for display
				if(!(id in this.imageCache)) {
					this.imageCache[id] = new Image();
					this.imageCache[id].src = displayObject.data;
				}
				// If cached image is complete
				if(this.imageCache[id].complete) {
					ctx.drawImage(this.imageCache[id], viewportCoords[0], viewportCoords[1]);
				}
			break;
			case 'line':
			case 'marker':
				ctx.strokeStyle = displayObject.color;
				ctx.lineWidth = displayObject.weight;
				// If active rendering, all points are absolute position to save cycles
				if('activeRendering' in displayObject) {
					var viewportPos = this.localToViewport(displayObject.data[0], edge);
					ctx.beginPath();
					ctx.moveTo(viewportPos[0], viewportPos[1]);
					for(var i = 1; i < displayObject.data.length; i++) {
						viewportPos = this.localToViewport(displayObject.data[i], edge);
						ctx.lineTo(viewportPos[0], viewportPos[1]);
					}
				}
				// Not active rendering, all points are relative to the bounding box
				else {
					var viewportPos = this.localToViewport([displayObject.data[0][0] + displayObject.rect[0], displayObject.data[0][1] + displayObject.rect[1]], edge);
					ctx.beginPath();
					ctx.moveTo(viewportPos[0], viewportPos[1]);
					for(var i = 1; i < displayObject.data.length; i++) {
						viewportPos = this.localToViewport([displayObject.data[i][0] + displayObject.rect[0], displayObject.data[i][1] + displayObject.rect[1]], edge);
						ctx.lineTo(viewportPos[0], viewportPos[1]);
					}
				}
				ctx.stroke();
			break;
			case 'rectangle':
				ctx.strokeStyle = displayObject.color;
				ctx.lineWidth = displayObject.weight;
				var viewportPos = this.localToViewport(displayObject.rect, edge);
				ctx.strokeRect(viewportPos[0], viewportPos[1], viewportPos[2] - viewportPos[0], viewportPos[3] - viewportPos[1]);
			break;
			case 'circle':
				ctx.strokeStyle = displayObject.color;
				ctx.lineWidth = displayObject.weight;
				var viewportPos = this.localToViewport(displayObject.rect, edge);
				ctx.beginPath();
				ctx.ellipse(viewportPos[0] + ((viewportPos[2] - viewportPos[0]) / 2),
				            viewportPos[1] + ((viewportPos[3] - viewportPos[1]) / 2),
							Math.abs((viewportPos[2] - viewportPos[0]) / 2),
				            Math.abs((viewportPos[3] - viewportPos[1]) / 2),
							0, 0, Math.PI * 2);
				ctx.stroke();
			break;
			case 'text':
				ctx.fillStyle = displayObject.color;
				ctx.font = displayObject.size + 'px ' + displayObject.family;
				ctx.textBaseline = 'bottom';
				var viewportPos = this.localToViewport(displayObject.rect, edge);
				ctx.fillText(displayObject.text, viewportPos[0], viewportPos[1]);
			break;
		}
	}

	getNewDisplayObjectId() {
		//console.log(this.curId);
		this.curId++
		return this.curId.toString();
	}

	createDisplayObject(objectType, options) {
		var newId = this.getNewDisplayObjectId();
		switch(objectType) {
			case 'image':
				var left = this.viewportEdge[0] + (this.viewportSize[0] / 2) - (options.width / 2);
				var top = this.viewportEdge[1] + (this.viewportSize[1] / 2) - (options.height / 2);
				return {
					id : newId,
					owner : this.uid,
					rev : 0,
					type : 'image',
					// Centerpoint of the current viewport
					rect : [left, top, left + options.width, top + options.height],
					data : options.data
				};
			break;
			case 'line':
				return {
					id : newId,
					owner : this.uid,
					rev : 0,
					type : 'line',
					rect : [options.coords[0], options.coords[1], options.coords[0], options.coords[1]],
					data : [[options.coords[0], options.coords[1]], [options.coords[0], options.coords[1]]],
					color: this.currentColor,
					weight: this.currentWeight
				};
			break;
			case 'marker':
				return {
					id : newId,
					owner : this.uid,
					rev : 0,
					type : 'marker',
					rect : [options.coords[0], options.coords[1], options.coords[0], options.coords[1]],
					data : [[options.coords[0], options.coords[1]]],
					color: this.currentColor,
					weight: this.currentWeight
				};
			break;
			case 'rectangle':
				return {
					id : newId,
					owner : this.uid,
					rev : 0,
					type : 'rectangle',
					rect : [options.coords[0], options.coords[1], options.coords[0], options.coords[1]],
					color: this.currentColor,
					weight: this.currentWeight
				};
			break;
			case 'circle':
				return {
					id : newId,
					owner : this.uid,
					rev : 0,
					type : 'circle',
					rect : [options.coords[0], options.coords[1], options.coords[0], options.coords[1]],
					color: this.currentColor,
					weight: this.currentWeight
				};
			break;
			case 'text':
				return {
					id : newId,
					owner : this.uid,
					rev : 0,
					type : 'text',
					rect : [options.coords[0], options.coords[1], options.coords[0], options.coords[1]],
					size : 16,
					family : 'Helvetica',
					text : 'test',
					color: this.currentColor,
					weight: this.currentWeight
				};
			break;
		}
	}

	// Add a display object to the list
	addDisplayObject(displayObject) {
		// Server push
		this.sendUpdate(['all'], [displayObject]);
		// Local store
		this.displayObjects[displayObject.id] = displayObject;
	}

	// Check if coords is within an object
	objectHitTest(coords) {
		// Assume we can only select our own objects for now
		var hitObjects = [];
		var localCoords = this.viewportToLocal(coords);
		// Check all objects for hit with buffer
		for(var id in this.displayObjects) {
			var displayObject = this.displayObjects[id];
			if(displayObject.owner == this.uid) {
				var bufferSize = 4 + ((displayObject.weight ? displayObject.weight : 0) / 2);
				if(displayObject.rect[0] - bufferSize <= localCoords[0] &&
				   displayObject.rect[2] + (bufferSize * 2) >= localCoords[0] &&
				   displayObject.rect[1] - bufferSize <= localCoords[1] &&
				   displayObject.rect[3] + (bufferSize * 2) >= localCoords[1]) {
					hitObjects.push(displayObject);
				}
			}
		}
		// TODO: Check z-index for topmost
		// For now only return the best one
		return (hitObjects.length > 0 ? hitObjects[0] : null);
	}

	// Fixes bounding rect and converts absolute points to relative
	convertActiveToDisplayObject(id) {
		var displayObject = this.displayObjects[id];
		switch(displayObject.type) {
			case 'line':
			case 'marker':
				displayObject.rect = [displayObject.data[0][0], displayObject.data[0][1], displayObject.data[0][0], displayObject.data[0][1]];
				for(var i = 1; i < displayObject.data.length; i++) {
					if(displayObject.data[i][0] < displayObject.rect[0]) displayObject.rect[0] = displayObject.data[i][0];
					if(displayObject.data[i][0] > displayObject.rect[2]) displayObject.rect[2] = displayObject.data[i][0];
					if(displayObject.data[i][1] < displayObject.rect[1]) displayObject.rect[1] = displayObject.data[i][1];
					if(displayObject.data[i][1] > displayObject.rect[3]) displayObject.rect[3] = displayObject.data[i][1];
				}
				for(var i = 0; i < displayObject.data.length; i++) {
					displayObject.data[i][0] -= displayObject.rect[0];
					displayObject.data[i][1] -= displayObject.rect[1];
				}
			break;
			case 'rectangle':
			case 'circle':
				if(displayObject.rect[2] < displayObject.rect[0]) {
					var temp = displayObject.rect[0];
					displayObject.rect[0] = displayObject.rect[2];
					displayObject.rect[2] = temp;
				}
				if(displayObject.rect[3] < displayObject.rect[1]) {
					var temp = displayObject.rect[1];
					displayObject.rect[1] = displayObject.rect[3];
					displayObject.rect[3] = temp;
				}
			break;
		}
		delete displayObject.activeRendering;
		// Full update
		this.sendUpdate(['all'], [displayObject]);
		this.activeObject = null;
	}

	deleteActiveObject() {
		if(this.activeObject) {
			// Delete object
			this.sendDelete([this.activeObject]);
			delete this.displayObjects[this.activeObject];
			this.activeObject = null;
		}
	}

	// Load a local image file
	loadImage(file) {
		var img = new Image();
		// Offscreen canvas
		var canvas = document.createElement('canvas');
		img.src = window.URL.createObjectURL(file);
		img.onload = function() {
			var scale = 1;
			if(img.width > this.maxImageSize || img.height > this.maxImageSize) {
				scale = this.maxImageSize / (img.width - this.maxImageSize > img.height - this.maxImageSize ? img.width : img.height);
			}
			canvas.width = img.width * scale;
			canvas.height = img.height * scale;
			var ctx = canvas.getContext('2d');
			ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, img.width * scale, img.height * scale);
			window.URL.revokeObjectURL(img.src);

			//TODO: Free canvas/context?
			this.addDisplayObject(this.createDisplayObject('image', {width : canvas.width, height : canvas.height, data : canvas.toDataURL()}));
		}.bind(this);
	}

	// Change weight dynamically
	setCurrentWeight(weight) {
		if(weight > this.maxWeight) weight = this.maxWeight;
		if(weight < 1) weight = 1;
		this.currentWeight = weight;
		if(this.activeObject && 'weight' in this.displayObjects[this.activeObject]) {
			var activeObject = this.displayObjects[this.activeObject];
			activeObject.weight = weight;
			this.sendUpdate(['weight'], [activeObject]);
		}
		else if(this.selectedObjects.length > 0) {
			var updatedObjects = [];
			this.selectedObjects.forEach(function(id) {
				if('weight' in this.displayObjects[id]) {
					this.displayObjects[id].weight = weight;
					updatedObjects.push(this.displayObjects[id]);
				}
			}.bind(this));
			if(updatedObjects.length > 0) this.sendUpdate(['weight'], updatedObjects);
		}
	}

	// Set current color
	setCurrentColor(color) {
		this.currentColor = color;
		if(this.activeObject && 'color' in this.displayObjects[this.activeObject]) {
			var activeObject = this.displayObjects[this.activeObject];
			activeObject.color = color;
			this.sendUpdate(['color'], [activeObject]);
		}
		else if(this.selectedObjects.length > 0) {
			var updatedObjects = [];
			this.selectedObjects.forEach(function(id) {
				if('color' in this.displayObjects[id]) {
					this.displayObjects[id].color = color;
					updatedObjects.push(this.displayObjects[id]);
				}
			}.bind(this));
			if(updatedObjects.length > 0) this.sendUpdate(['color'], updatedObjects);
		}
	}

	// Set current tool
	setCurrentTool(tool) {
		// Deselect all
		this.selectedObjects = [];
		// Delete any active objects
		this.deleteActiveObject();
		this.currentTool = tool;
	}

	// Delete selection object(s)
	deleteSelected() {
		// TODO: Send message to the server
		this.sendDelete(this.selectedObjects);

		// Delete locally
		this.selectedObjects.forEach(function(id) {
			delete this.displayObjects[id];
		}.bind(this));
		// Deselect all
		this.selectedObjects = [];
	}

	toggleDebug() {
		this.showDebugInfo = !this.showDebugInfo;
	}

	uiInteraction(x, y) {
		//color selection
		if(x > 2 && x <= this.colorOptions.length * 30) {
			this.setCurrentColor(this.colorOptions[Math.floor((x - 2) / 30.0)]);
			return;
		}
		var offset = 4 + this.colorOptions.length * 30;
		if(x > offset && x < offset + 22) {
			this.setCurrentWeight(this.currentWeight - 1);
			return;
		}
		offset += 74 + 22 + 4;
		if(x > offset && x < offset + 22) {
			this.setCurrentWeight(this.currentWeight + 1);
			return;
		}
		offset += 22 + 8;
		if(x > offset + 2 && x <= offset + this.toolOptions.length * 30) {
			this.setCurrentTool(this.toolOptions[Math.floor((x - (offset + 2)) / 30.0)]);
			return;
		}
	}

	/****************
	  Input Events
	*****************/
	mouseDown(x, y) {
		if(y < 30) return this.uiInteraction(x, y);

		this.isMouseDown = true;
		this.grabPos = [x, y];
		switch(this.currentTool) {
			case 'pointer':
				// If shift is not held then clear current selections
				if(!this.isShiftDown) this.selectedObjects = [];
				// If ctrl is not held down then act as click to select
				if(!this.isCtrlDown) {
					var hitObject = this.objectHitTest([x, y]);
					// Add hit object to selected if hit
					if(hitObject) {
						// Only allow each object to be added once
						if(this.selectedObjects.indexOf(hitObject.id) == -1) this.selectedObjects.push(hitObject.id);
					}
					// No hit object and none selected
					else if(this.selectedObjects.length == 0) {
						// Save last viewport edge position in anticipation of drag
						this.origViewportEdge = [this.viewportEdge[0], this.viewportEdge[1]];
					}
				}
			break;
			case 'line':
				var localCoords = this.viewportToLocal([x, y]);
				var lineObject = this.createDisplayObject('line', {coords: localCoords});
				lineObject.activeRendering = true;
				this.addDisplayObject(lineObject);
				this.activeObject = lineObject.id;
			break;
			case 'marker':
				var localCoords = this.viewportToLocal([x, y]);
				var markerObject = this.createDisplayObject('marker', {coords: localCoords});
				markerObject.activeRendering = true;
				this.addDisplayObject(markerObject);
				this.activeObject = markerObject.id;
			break;
			case 'rectangle':
				var localCoords = this.viewportToLocal([x, y]);
				var rectObject = this.createDisplayObject('rectangle', {coords: localCoords});
				rectObject.activeRendering = true;
				this.addDisplayObject(rectObject);
				this.activeObject = rectObject.id;
			break;
			case 'circle':
				var localCoords = this.viewportToLocal([x, y]);
				var circleObject = this.createDisplayObject('circle', {coords: localCoords});
				circleObject.activeRendering = true;
				this.addDisplayObject(circleObject);
				this.activeObject = circleObject.id;
			break;
			case 'text':
				// TODO: fix text input
				var localCoords = this.viewportToLocal([x, y]);
				var textObject = this.createDisplayObject('text', {coords: localCoords});
				textObject.activeRendering = true;
				this.addDisplayObject(textObject);
				this.activeObject = textObject.id;
			break;
		}
	}

	mouseUp(x, y) {
		// Clear tracking
		this.isMouseDown = false;
		this.grabPos = null;
		this.origViewportEdge = null;
		// Update active object to display
		if(this.activeObject) {
			var activeObject = this.displayObjects[this.activeObject];
			// active object area too small
			if(Math.abs(activeObject.rect[0] - activeObject.rect[2]) < 1 && Math.abs(activeObject.rect[1] - activeObject.rect[3]) < 1) {
				this.deleteActiveObject();
			}
			else {
				this.convertActiveToDisplayObject(this.activeObject);
			}
		}
		// Clear orig rect from selected objects
		this.selectedObjects.forEach(function(id) {
			delete this.displayObjects[id].origRect;
		}.bind(this));
	}

	mouseMove(x, y) {
		// Convert mouse position to viewport coordinates
		var localPos = this.viewportToLocal([x, y]);
		// Store active object
		var activeObject = null;
		if(this.activeObject) activeObject = this.displayObjects[this.activeObject];
		// Store viewport mouse coords
		this.mousePos = [x, y];
		// On drag
		if(this.isMouseDown) {
			switch(this.currentTool) {
				case 'pointer':
					// Pointer rectangle selection
					if(this.isCtrlDown && this.grabPos) {
						//nothing at the moment
					}
					// Pointer move objects
					else if(this.selectedObjects.length > 0) {
						var updatedDisplayObjects = [];
						this.selectedObjects.forEach(function(id) {
							var selectedObject = this.displayObjects[id];
							// Generate orig rect for objects before displacement if missing
							if(!('origRect' in selectedObject)) {
								selectedObject.origRect = [selectedObject.rect[0], selectedObject.rect[1], selectedObject.rect[2], selectedObject.rect[3]];
							}
							// Displace the position of the selected objects by drag amount
							selectedObject.rect = [selectedObject.origRect[0] + (this.mousePos[0] - this.grabPos[0]),
							                      selectedObject.origRect[1] + (this.mousePos[1] - this.grabPos[1]),
												  selectedObject.origRect[2] + (this.mousePos[0] - this.grabPos[0]),
												  selectedObject.origRect[3] + (this.mousePos[1] - this.grabPos[1])]
							updatedDisplayObjects.push(selectedObject);
						}.bind(this));
						// Rect only update
						this.sendUpdate(['rect'], updatedDisplayObjects);
					}
					// Nothing selected then pointer as move viewport
					else {
						this.viewportEdge = [this.origViewportEdge[0] - (this.mousePos[0] - this.grabPos[0]),
											 this.origViewportEdge[1] - (this.mousePos[1] - this.grabPos[1])]
					}
				break;
				case 'line':
					// Make sure we have an active object and it matches the tool type
					if(activeObject && activeObject.type == 'line') {
						// Snap to right or 45 degree angle
						if(this.isCtrlDown) {
							var distX = localPos[0] - activeObject.data[0][0];
							var distY = localPos[1] - activeObject.data[0][1];
							var distXAbs = Math.abs(distX);
							var distYAbs = Math.abs(distY);
							//TODO: Better detection of snap axis
							if(distX != 0 && distY != 0 && distXAbs - 25 < distYAbs && distXAbs + 25 > distYAbs) {
								// diagonal
								activeObject.data[1] = [activeObject.data[0][0] + ((distX / distXAbs) * Math.max(distXAbs,distYAbs)),
								                        activeObject.data[0][1] + ((distY / distYAbs) * Math.max(distXAbs,distYAbs))];
							}
							else if(distXAbs > distYAbs) {
								activeObject.data[1] = [localPos[0], activeObject.data[0][1]];
							}
							else {
								activeObject.data[1] = [activeObject.data[0][0], localPos[1]];
							}
						}
						else {
							activeObject.data[1] = [localPos[0], localPos[1]];
						}
						activeObject.rect[0] = Math.min(activeObject.data[0][0], activeObject.data[1][0]);
						activeObject.rect[1] = Math.min(activeObject.data[0][1], activeObject.data[1][1]);
						activeObject.rect[2] = Math.max(activeObject.data[0][0], activeObject.data[1][0]);
						activeObject.rect[3] = Math.max(activeObject.data[0][1], activeObject.data[1][1]);
						// Rect and all data
						this.sendUpdate(['rect', 'dataMod'], [activeObject]);
					}
				break;
				case 'marker':
					// Make sure we have an active object and it matches the tool type
					if(activeObject && activeObject.type == 'marker') {
						// Multisegment line
						activeObject.data.push([localPos[0], localPos[1]]);
						if(localPos[0] < activeObject.rect[0]) activeObject.rect[0] = localPos[0];
						if(localPos[0] > activeObject.rect[2]) activeObject.rect[2] = localPos[0];
						if(localPos[1] < activeObject.rect[1]) activeObject.rect[1] = localPos[1];
						if(localPos[1] > activeObject.rect[3]) activeObject.rect[3] = localPos[1];
						// Rect and add data
						this.sendUpdate(['rect', 'dataAdd'], [activeObject]);
					}
				break;
				case 'rectangle':
				case 'circle':
					// Make sure we have an active object and it matches the tool type
					if(activeObject && activeObject.type == 'rectangle' || activeObject.type == 'circle') {
						// Snap to square
						if(this.isCtrlDown) {
							var distX = localPos[0] - activeObject.rect[0];
							var distY = localPos[1] - activeObject.rect[1];
							var distXAbs = Math.abs(distX);
							var distYAbs = Math.abs(distY);
							activeObject.rect[2] = activeObject.rect[0] + ((distX / distXAbs) * Math.max(distXAbs,distYAbs));
							activeObject.rect[3] = activeObject.rect[1] + ((distY / distYAbs) * Math.max(distXAbs,distYAbs));
						}
						else {
							activeObject.rect[2] = localPos[0];
							activeObject.rect[3] = localPos[1];
						}
						// Rect only
						this.sendUpdate(['rect'], [activeObject]);
					}
				break;
			}
		}
	}

	// Update keystate
	keyState(ctrl, shift) {
		this.isCtrlDown = ctrl;
		this.isShiftDown = shift;
	}

	/*****************
	  Network Functions
	******************/
	establishConnection() {
		this.activeSocket = new WebSocket('ws://' + this.host + ':8081/' + this.guid)
		// Register event listeners
		this.activeSocket.addEventListener('open', this.onSocketOpen.bind(this));
		this.activeSocket.addEventListener('close', this.onSocketClose.bind(this));
		this.activeSocket.addEventListener('error', this.onSocketError.bind(this));
		this.activeSocket.addEventListener('message', this.onSocketMessage.bind(this));
	}

	onSocketOpen(e) {
		this.isSocketOpen = true;
	}

	onSocketClose(e) {
		this.isSocketOpen = false;
		// Clear on disconnect
		this.displayObjects = {};
		this.activeObject = null;
		this.selectedObjects = [];
		// Attempt to reestablish connection
		this.establishConnection();
	}

	onSocketError(e) {
		this.isSocketOpen = false;
		console.error("WebSocket error:", event);
		// close on error
		this.activeSocket.close();
	}

	onSocketMessage(e) {
		var msgObj = JSON.parse(e.data.toString());
		switch(msgObj.action) {
			// Update or add object(s)
			case 'update':
				msgObj.objectData.forEach(function(objectData) {
					this.updateDisplayObject(msgObj.types, objectData);
				}.bind(this));
			break;
			// Delete object(s)
			case 'delete':
				msgObj.objectData.forEach(function(id) {
					delete this.displayObjects[id];
				}.bind(this));
			break;
		}
	}

	updateDisplayObject(updateTypes, objectData) {
		if(parseInt(objectData.id) > this.curId) this.curId = parseInt(objectData.id);
		// All is a full object sync
		if(updateTypes.indexOf('all') != -1) {
			// New or fully updated
			this.displayObjects[objectData.id] = objectData;
		}
		else {
			if(objectData.id in this.displayObjects && objectData.rev >= this.displayObjects[objectData.id].rev) {
				// update revision
				this.displayObjects[objectData.id].rev = objectData.rev;
				updateTypes.forEach(function(updateType) {
					switch(updateType) {
						case 'color':
							this.displayObjects[objectData.id].color = objectData.color;
						break;
						case 'weight':
							this.displayObjects[objectData.id].weight = objectData.weight;
						break;
						case 'rect':
							this.displayObjects[objectData.id].rect = objectData.rect;
						break;
						case 'dataAdd':
							this.displayObjects[objectData.id].data = this.displayObjects[objectData.id].data.concat(objectData.data);
						break;
						case 'dataMod':
							this.displayObjects[objectData.id].data = objectData.data;
						break;
					}
				}.bind(this));
			}
			// Older revision, discard
			else if(objectData.id in this.displayObjects) {
				console.log("WARN: Recieved old revision");
			}
			// Object doesn't exist, send sync request
			else {
				console.log("WARN: No object exists for update");
			}
		}
	}

	// Sync local objects with server store
	sendSync() {
		var msgObj = {action : 'sync',
					  data : []};
		// Send a catalog of our local object store for validation
		// server should respond with update and delete object messages
		// if needed
		for(var id in this.displayObjects) {
			msgObj.data.push([id, this.displayObjects[id].rev]);
		}

		this.send(msgObj);
	}

	// Send updated object(s) to server
	sendUpdate(updateTypes, displayObjects) {
		// Always increment revisions
		for(var i = 0; i < displayObjects.length; i++) {
			displayObjects[i].rev++;
		}

		var msgObj = {action : 'update'};
		// Send full updates
		if(updateTypes.indexOf('all') != -1) {
			msgObj.types = ['all'];
			msgObj.objectData = displayObjects;
		}
		else {
			msgObj.types = updateTypes;
			msgObj.objectData = [];
			displayObjects.forEach(function(displayObject) {
				var dataObject = {id : displayObject.id, rev : displayObject.rev};
				updateTypes.forEach(function(updateType) {
					switch(updateType) {
						case 'color':
							dataObject.color = displayObject.color;
						break;
						case 'weight':
							dataObject.weight = displayObject.weight;
						break;
						case 'rect':
							dataObject.rect = displayObject.rect;
						break;
						case 'dataAdd':
							// Single last data point
							dataObject.data = [displayObject.data[displayObject.data.length - 1]];
						break;
						case 'dataMod':
							dataObject.data = displayObject.data;
						break;
					}
				}.bind(this));
				msgObj.objectData.push(dataObject);
			}.bind(this));
		}

		this.send(msgObj);
	}

	// Send deleted object(s) to server
	sendDelete(ids) {
		this.send({action : 'delete',
					  objectData : ids});

	}

	send(msgObject) {
		if(this.host && this.guid) {
			var msg = JSON.stringify(msgObject);
			//console.log('SEND: ' +  msg);
			if(this.isSocketOpen) {
				// Dump queue
				this.msgQueue.forEach(function(msg) {
					this.activeSocket.send(msg);
				}.bind(this));
				this.msgQueue = [];
				this.activeSocket.send(msg);
			}
			else {
				this.msgQueue.push(msg);
				console.log("Queued " + this.msgQueue.length + " Messages");
			}
		}
	}
}


var whiteboardCanvas = null;
var whiteboardContext = null;

var wb;

function whiteboardInit() {
	var urlParams = new URLSearchParams(location.search);
	var guid = urlParams.get('guid');
	//var hostname = (location.hostname ? location.hostname : '127.0.0.1');
	var hostname = location.hostname;
	wb = new Whiteboard(hostname, guid);

	whiteboardCanvas = document.getElementById('whiteboardCanvas');
	whiteboardContext = whiteboardCanvas.getContext('2d');

	// Capture events
	window.addEventListener('resize', whiteboardResizeCanvas, false);
	window.addEventListener('mousedown', whiteboardMouseDown, false);
	window.addEventListener('mouseup', whiteboardMouseUp, false);
	window.addEventListener('mousemove', whiteboardMouseMove, false);
	window.addEventListener('keydown', whiteboardKeyDown, false);
	window.addEventListener('keyup', whiteboardKeyUp, false);
	window.addEventListener('wheel', whiteboardMouseWheel, false);

	// Initial resize
	whiteboardResizeCanvas();
	// Begin animation loop
	window.requestAnimationFrame(whiteboardFrame);
}

function whiteboardResizeCanvas() {
	whiteboardCanvas.width = window.innerWidth;
	whiteboardCanvas.height = window.innerHeight;
	wb.resizeViewport(window.innerWidth, window.innerHeight);
	whiteboardRedraw();
}

function whiteboardMouseDown(e) {
	// Update key states
	wb.keyState(e.ctrlKey, e.shiftKey);
	// Left mouse button down
	if(e.buttons % 2 != 0) {
		wb.mouseDown(e.clientX, e.clientY);
		e.preventDefault();
	}
}

function whiteboardMouseUp(e) {
	// Update key states
	wb.keyState(e.ctrlKey, e.shiftKey);
	// Left mouse button up
	if(e.buttons % 2 === 0) {
		wb.mouseUp(e.clientX, e.clientY);
		e.preventDefault();
	}
}

function whiteboardMouseMove(e) {
	// Update key states
	wb.keyState(e.ctrlKey, e.shiftKey);
	wb.mouseMove(e.clientX, e.clientY);
}

function whiteboardKeyDown(e) {
	// Update key states
	wb.keyState(e.ctrlKey, e.shiftKey);
	switch(e.key) {
		case '[':
			wb.setCurrentWeight(wb.currentWeight - 1);
		break;
		case ']':
			wb.setCurrentWeight(wb.currentWeight + 1);
		break;
		case ',':
			var colorIndex = wb.colorOptions.indexOf(wb.currentColor);
			colorIndex--;
			if(colorIndex < 0) colorIndex = wb.colorOptions.length - 1;
			wb.setCurrentColor(wb.colorOptions[colorIndex]);
		break;
		case '.':
			var colorIndex = wb.colorOptions.indexOf(wb.currentColor);
			colorIndex++;
			if(colorIndex >= wb.colorOptions.length) colorIndex = 0;
			wb.setCurrentColor(wb.colorOptions[colorIndex]);
		break;
		case '1':
			wb.setCurrentTool('pointer');
		break;
		case '2':
			wb.setCurrentTool('marker');
		break;
		case '3':
			wb.setCurrentTool('line');
		break;
		case '4':
			wb.setCurrentTool('rectangle');
		break;
		case '5':
			wb.setCurrentTool('circle');
		break;
		/*case '6':
			wb.setCurrentTool('text');
		break;*/
		case 'Delete':
			wb.deleteSelected();
		break;
		case 'd':
			wb.toggleDebug();
		break;
	}
}

function whiteboardKeyUp(e) {
	// Update key states
	wb.keyState(e.ctrlKey, e.shiftKey);
}

function whiteboardFrame(timestamp) {
	whiteboardRedraw();
	window.requestAnimationFrame(whiteboardFrame);
}

function whiteboardRedraw() {
	// Full canvas clear
	whiteboardContext.clearRect(0, 0, whiteboardCanvas.width, whiteboardCanvas.height);
	wb.renderViewport(whiteboardContext);
}

function whiteboardMouseWheel(e) {
	wb.zoom += 0.05 * (e.deltaY < 0 ? -1 : 1);
	e.preventDefault();
}

function whiteboardLoadImage(field) {
	wb.loadImage(field.files[0]);
}

function saveImage() {
	var data = wb.saveImage(whiteboardCanvas);
	var link = document.getElementById('download-link');
	link.setAttribute('download', wb.guid + '.png');
	link.setAttribute('href', data.replace("image/png", "image/octet-stream"));
	link.click();
}