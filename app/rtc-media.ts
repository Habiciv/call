// Only the offerer creates slots. The answerer reuses the offered m-lines.
export function mediaSlots(pc:RTCPeerConnection){
 const tracks=pc.getTransceivers().filter(t=>!(t as RTCRtpTransceiver & {stopped?:boolean}).stopped);
 const audio=tracks.filter(t=>t.receiver.track.kind==='audio');
 return {voice:audio[0],video:tracks.find(t=>t.receiver.track.kind==='video'),sharedAudio:audio[1]};
}
export function createOfferSlots(pc:RTCPeerConnection,microphone:MediaStream|null){
 const track=microphone?.getAudioTracks()[0];
 pc.addTransceiver(track||'audio',{direction:'sendrecv',streams:microphone?[microphone]:[]});
 pc.addTransceiver('video',{direction:'sendrecv'});
 pc.addTransceiver('audio',{direction:'sendrecv'});
 return mediaSlots(pc);
}
export async function bindNegotiatedMedia(pc:RTCPeerConnection,microphone:MediaStream|null,screen:MediaStream|null){
 const slots=mediaSlots(pc);
 if(!slots.voice||!slots.video||!slots.sharedAudio)throw Error('A chamada está usando uma versão incompatível. Atualize os dois navegadores.');
 for(const [slot,track,stream] of [
  [slots.voice,microphone?.getAudioTracks()[0]||null,microphone],
  [slots.video,screen?.getVideoTracks()[0]||null,screen],
  [slots.sharedAudio,screen?.getAudioTracks()[0]||null,screen],
 ] as const){
  slot.direction='sendrecv';await slot.sender.replaceTrack(track);
  if(typeof slot.sender.setStreams==='function')slot.sender.setStreams(...(stream?[stream]:[]));
 }
 return slots;
}
export function trackRole(pc:RTCPeerConnection,event:RTCTrackEvent){
 const slots=mediaSlots(pc);
 if(event.track.kind==='video')return 'screen-video';
 if(slots.sharedAudio&&(slots.sharedAudio.receiver===event.receiver||slots.sharedAudio.mid!==null&&slots.sharedAudio.mid===event.transceiver.mid))return 'screen-audio';
 return 'voice';
}

