const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const webrtc = require("wrtc");
const fs = require('fs');
const https = require('https');

const cors = require('cors');




let senderStream = {};

var cherry =[
    {
        urls: "turn:74.235.112.32:3478",
        username: "any",
        credential: "any",
      },
    
  ];

var key = fs.readFileSync(__dirname + '/fillmasjid.com.pk');
var cert = fs.readFileSync(__dirname + '/fillmasjid.com.pem');
var options = {
  key: key,
  cert: cert
};


app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors({origin: 'https://app.fillmasjid.in'}));


var Broadcasts = {};


class Broadcast{
    constructor(connectionID){
        this.connectionID = connectionID;
        this.adminStream = null;
        this.consumerStreams = [];
    }
    addAdminStream(stream){
        this.adminStream = stream;
    }
    addConsumerStream(stream){
        console.log(this.adminStream);
        stream.AttachTrackToListen(this.adminStream.track);
        this.consumerStreams.push(stream);
    }
    
}


class StreamObject {
    constructor(connectionID, sdp,type ="consumer") {
        this.peer = new webrtc.RTCPeerConnection({ iceServers: cherry });
        this.desc = new webrtc.RTCSessionDescription(sdp);
        this.connectionID = connectionID;
        this.answer = null;
        this.track = null;
        this.type=type;
        // Add event listeners
        this.addEventListeners();

        // Set the remote description and wait for the correct state to load
        this.peer.setRemoteDescription(this.desc);
        this.peer.ontrack = (e) => this.handleBroadcastStreamGetter(e);

    }

    addEventListeners() {
        this.peer.onicecandidate = (event) => {
            if (event.candidate) {
                //console.log('New ICE candidate:', event.candidate);
                // You can send this candidate to the other peer if needed
            }
        };
        this.peer.onsignalingstatechange = () => {
            //console.log('peer.onsignalingstatechange ' + this.peer.signalingState);
            if (this.peer.signalingState === 'have-remote-offer') {
                this.load();
            }
        };

        this.peer.oniceconnectionstatechange = () => {
            console.log('peer.oniceconnectionstatechange ' + this.peer.iceConnectionState);
            if (this.peer.iceConnectionState === 'disconnected') {
                this.cleanup();
            }
        };

        this.peer.onerror = (error) => {
            console.error('RTCPeerConnection error:', error);
        };
    }

    async load() {
        try {
            this.answer = await this.peer.createAnswer();
            await this.peer.setLocalDescription(this.answer);
        } catch (error) {
            console.error("Error in load method:", error);
        }
    }
    cleanup() {
        // Close the RTCPeerConnection
        this.peer.close();

        console.log('StreamObject resources released.');
    }

    response() {
        return {
            sdp: this.peer.localDescription,
            connectionID: this.connectionID
        };
    }

    handleBroadcastStreamGetter(e){
        this.track = e.streams[0];
    }

    AttachTrackToListen(admintrack){
        admintrack.getTracks().forEach(track => this.peer.addTrack(track, admintrack));
    }

}







app.post("/consumer", async ({ body }, res) => {
    if(!Broadcasts[body.connectionID]){
        res.json({})
        return
    }
	const stream = new StreamObject(body.connectionID,body.sdp);
    Broadcasts[body.connectionID].addConsumerStream(stream);
    await stream.load();
    res.json(stream.response());
    
	return;
});

app.post('/broadcast', async ({ body }, res) => {

    const broadcast = new Broadcast(body.adminStream,body.connectionID);

    const stream = new StreamObject(body.connectionID,body.sdp,type="admin");
    await stream.load();
    broadcast.addAdminStream(stream);
    Broadcasts[stream.connectionID] = broadcast;
    res.json(stream.response());

	return;

});



var server = https.createServer(options, app);
server.listen(443,'0.0.0.0', () => console.log('server started'));