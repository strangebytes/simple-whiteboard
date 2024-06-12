## Synopsis

A simple shared realtime multi-user whiteboard proof of concept.

* Realtime sync to unlimited* clients
* Support for unlimited* canvas size
* Server storage of named whiteboards in json format
* Drawing support for free draw, straight line, circle, rectangle, insert image, multiple colors, and line weight
* Ability to save whiteboard as PNG image from client

\* Limited by connection and numeric storage limits

![Screenshot](screenshot.jpg)

## Motivation

This was a POC project for a browser-based shared whiteboard to facilitate team collaboration. The majority of logic and whiteboard processing is done with client-side javascript utilizing a small node.js server acting as a broker to distribute update messages to clients via a websocket connection. The message protocol attempts to be as lean as possible, only passing along updates to out-of-sync clients.

## Known Issues

* Layered object selection can be unpredictable
* Some top bar controls are drawn under objects
* Rectangle multi-selection selects nothing
* The text drawing tool is incomplete
* Save whiteboard as image sometimes incorrectly calculates the whiteboard bounds for certain objects
* Placing objects a very large distance from one another may result in invalid images when saving whiteboards

## Possible Enhancements

* Add the ability to change layer level of components (currently they are drawn from oldest to newest order)
* Add the ability to draw text
* Add the ability to resize components
* Add some resonable limits
* Santizie file names for created whiteboards
* Add a page with a list of available whiteboards
* Add access restrictions, login, user update spoof protection

## Usage

Users access the whiteboard at the address of the server host on port 8081 at the following example URL:

http://127.0.0.1:8081/whiteboard.html

Accessing the URL directly will give a sample whiteboard but will not save any changes made by the user. To save and share whiteboard changes the URL must be appended by the whiteboard GUID which can be any string, for example:

http://127.0.0.1:8081/whiteboard.html?guid=test

This creates a new whiteboard for that GUID if it doesn't already exist or loads the existing whiteboard if it was previously created. Whiteboard are saved in the whiteboards folder on the host as JSON files.

### Tool Usage

#### Pointer Tool

Left clicking within an object selects the object.
Left clicking and holding allows dragging of the object to reposition it.
Shift + left click on objects allows multiple obejcts to be selected, holding on the final object selection allows all objects to be repositioned together.
Left clicking and holding outside of any objects allows the whiteboard viewport(user view of the whiteboard) to be moved.
<del>Ctrl + left click and hold allows rectangle selection of objects.<del>

#### Marker Tool
Left click and drag allows freehand drawing with the set line weight and color.

#### Line Tool
Left click and hold to set one point of the line, the mouse can be moved to preview the line with the second point at the mouse location, releasing the mouse button will create the line with the set line weight and color.
Holding ctrl while dragging will force only vertical and horizontal lines.

#### Rectable Tool
Left click and hold to set one corner of the rectangle, the mouse can be moved to preview the rectangle with the opposite corner at the mouse location, releasing the mouse button will create the rectangle with the set line weight and color.
Holding ctrl while dragging will force the rectangle to keep a 1:1 aspect ratio(square).

#### Circle Tool
Left click and hold to set one corner of the circle bounds, the mouse can be moved to preview the circle with the bounds opposite corner at the mouse location, releasing the mouse button will create the circle with the set line weight and color.
Holding ctrl while dragging will force the circle bounds to keep a 1:1 aspect ratio(prevent elipse.)

#### Add Image
Click the Browse... button and select an image, the image format must be supported by the browser. The loaded image will be placed at the center of the screen and can be selected to with the pointer tool to be moved.

#### Keyboard Shortcuts
[ and ] - Decrease/increase the line weight
, and . - Move color index left and right
1 - Pointer tool
2 - Marker tool
3 - Line tool
4 - Rectangle tool
5 - Circle tool
Del - Delete selected object(s)
d - Toggle debug mode

## Source Code Notes

The client-side whiteboard is implemented as a large javascript class that handles most event processing from the browser which could make displaying multiple whiteboards possible with minimal changes. The node server is fairly simplistic, only processing messages from clients, saving them locally and passing them along.

## Build Instructions

The application can be run as a standard node program to host locally or the provided Docker file can be used to build and deploy as a container.

### Example Docker commands

#### Build the Container from the Source Folder

```bash
docker build -t simple-whiteboard .
```

#### Deploy the Container

```bash
docker run -d -p 8081:8081 simple-whiteboard
```

- or to map the whiteboard save location

```bash
docker run -d -p 8081:8081 -v /path/to/local/whiteboards:/app/whiteboards simple-whiteboard
```