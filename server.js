const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const webrtc = require("wrtc");
const https = require('https');
const fs = require('fs');
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const cors = require('cors');
const { mem } = require('node-os-utils');
const io = require('@pm2/io');
const morgan = require('morgan');
app.use(cors({
    origin: 'https://app.fillmasjid.in'
}));
app.use(morgan('combined'));

var notifUsers = 0;
var failedNotif = 0;
io.metric({name:'No. of User Connections',value:()=>Object.keys(PEERS).length});
io.metric({name:'No. of Active Masjids',value:()=>{return Object.keys(senderStream).length;}});
io.metric({name:'Notification Sent to',value:()=>{return notifUsers}});
io.metric({name:'No. of Failed Notifications',value:()=>{return failedNotif;}});



let senderStream = {};
var cherry =[
    {
        urls: "turn:20.219.124.202:3478",
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

app.post("/consumer", async ({ body }, res) => {
	
	
	
    const peer = new webrtc.RTCPeerConnection({iceServers: cherry});
    const desc = new webrtc.RTCSessionDescription(body.sdp);
    await peer.setRemoteDescription(desc);
	
	var streamNow = senderStream[body.connectionID.trim()];
	if(streamNow == undefined){
		res.json({});return;
	}
	try {
        streamNow.getTracks().forEach(track => peer.addTrack(track, streamNow));    
    } catch (error) {
        console.log("Stream "+body.connectionID+" not Up Yet");
        res.json({});
        return;
    }
     peer.onconnectionstatechange = (ev)=>{
//        console.log("| LJN | "+body.version + " - " + peer.connectionState + " - " + JSON.stringify(Object.keys(PEERS)));
	}

    //console.log(streamNow);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    const payload = {sdp: peer.localDescription,streams:Object.keys(senderStream)};
    if(PEERS[body.version] != undefined){
        PEERS[body.version].close();
        clearPeers();
    }
    PEERS[body.version]=peer;
    
    res.json(payload);
});

app.post('/broadcast', async ({ body }, res) => {
    const peer = new webrtc.RTCPeerConnection({iceServers: cherry});
	
    peer.ontrack = (e) => handleTrackEvent(e, peer,body.connectionID.trim());
    firebaseRequestList.push(body.connectionID.trim())
    const desc = new webrtc.RTCSessionDescription(body.sdp);
    await peer.setRemoteDescription(desc);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    const payload = {
        sdp: peer.localDescription,
		connectionID: body.connectionID
    }
    console.log("| AJN | "+body.version);

    res.json(payload);
    if(firebaseInterval == null || firebaseInterval == undefined){
        firebaseInterval = setInterval(firebaseRunLoop,firebaseRequestDelay*1000);
    }
    if(PEERS[body.version] != undefined){
        PEERS[body.version].close();
        clearPeers();
    }
    PEERS[body.version]=peer;
    
});

function handleTrackEvent(e, peer,connID) {
    senderStream[connID] = e.streams[0];
    
};
function clearPeers() {
    var vers = Object.keys(PEERS);
    var ret = [];
    vers.forEach(version => {
        
        if(PEERS[version].connectionState == "failed" || PEERS[version].connectionState == "disconnected" || PEERS[version].connectionState == "closed"){
            console.log("| CLR | " + version + " LEFT " +(vers.length));
            PEERS[version].close();
            PEERS[version] = undefined;

        }
        else{
            ret[version] = PEERS[version];
        }
    });
    PEERS = ret;
    // if(Object.keys(PEERS).length == 0){
    //     clearInterval(memoryInterval);
    //     memoryInterval = undefined;
    // }
    // else{
    //     if(memoryInterval == undefined){
    //         memoryInterval = setInterval(clearPeers,5000);
    //     }
    // }
}

var server = https.createServer(options, app);
server.listen(443,'0.0.0.0', () => console.log('server started'));
var PEERS = {};

var memoryInterval = setInterval(clearPeers,5000);

var firebaseRequestDelay = 3;
var firebaseRequestList = [];
let unique = (a,t={}) => a.filter(e=>!(t[e]=e in t));
var firebaseInterval = setInterval(firebaseRunLoop,firebaseRequestDelay*1000);
function firebaseRunLoop(){
    var ret = [];
    
    for(var i = 0 ; i < firebaseRequestList.length;i++){
        if(i ==0){launchFire(firebaseRequestList[i])}
        else{ret.push(firebaseRequestList[i]);}
    }
    unique(ret);
    firebaseRequestList = ret;
    if(firebaseRequestList.length == 0){clearInterval(firebaseInterval);firebaseInterval=undefined;}

}

async function launchFire(hash){
    var registeredIDs = JSON.parse(await getFireIds(hash));
    

    try{
        notifUsers = registeredIDs.length;
       failedNotif = 0;
    }
    catch(e){
      console.log("Exception in setting notified users");
    }



    registeredIDs.forEach(element => {
        console.log("| NOT | "+element.version);
        
        fire(hash,element.version,element.firebase_token);
    });
    console.log( "| "+add_zero(registeredIDs.length,3)+" | "+ "EXPECTED -> " + hash);
}

function add_zero(your_number, length) {
    var num = '' + your_number;
    while (num.length < length) {
        num = '0' + num;
    }
    return num;
}

async function fire(hash,version,fireToken){
    
    
    const serverKey = 'AAAAniguGJI:APA91bGyqHQUE9gcDMZXPiPeFfqjRxnA5XsEHxu5RYrHAyDEmu7ms2-Iys1FUXdOuhRi8X0yULBJbPVpsrUGDkoyv2tSS-AwVUUaLIsv3zSMk1XMCoZSbs5Bc-6vvhdVg9681Z8ui7cR';
            const message = {
                to: fireToken,
                notification: {
                title: 'Azaan',
                body: "Azaan Time.",
                },
                data: {
                hash:hash+"&bg_id="+version,
                static_notify_title:"Azaan",
                static_notify_body:hash,
                version:version
                },
                priority : "high",
                android:{
                    priority:"high"
                },
                apns:{
                    "headers":{
                      "apns-priority":"5"
                    }
                  },
                webpush: {
                    "headers": {
                      "Urgency": "high"
                    }
                }
            };
            
            const options = {
                hostname: 'fcm.googleapis.com',
                port: 443,
                path: '/fcm/send',
                method: 'POST',
                headers: {
                'Content-Type': 'application/json',
                'Authorization': `key=${serverKey}`
                }
            };
            
            const req = https.request(options, (res) => {
                let response = '';
            
                res.on('data', (chunk) => {
                response += chunk;
                });
            
                res.on('end', () => {
                 var x = JSON.parse(response);
                console.log("| SUC | "+x.success+" " + version  +" | FAL | "+x.failure);
                failedNotif += 1; 
                // console.log("| FAL | "+x.failure);
                // console.log("| ___ | ___________________________________________________")
                });
            });
            
            req.on('error', (e) => {
                console.error(e);
            });
            
            req.write(JSON.stringify(message));
            req.end();
}



function getFireIds(masjidToken){
    return new Promise(function (resolve, reject) {
        
        var url = "https://fillmasjid.in/api/app/api12.php";

          var xhr = new XMLHttpRequest();
          xhr.open("POST", url);

          xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");

          xhr.onreadystatechange = function () {
          if (xhr.readyState === 4) {
              var resp = xhr.responseText;
              //console.log("Users Notified " + resp);
              resolve(resp.trim());

          }
      };

          var data = "masjidToken="+masjidToken+"&task=getFireTokens&version=3duverseServer";
        
          xhr.send(data);
      });
}

