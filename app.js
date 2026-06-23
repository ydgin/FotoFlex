let video =
document.getElementById("camera");

let gallery =
document.getElementById("gallery");

let album =
document.getElementById("album");

let search =
document.getElementById("search");


let db;


let request =
indexedDB.open("PhotoBase",1);



request.onupgradeneeded=e=>{

db=e.target.result;


let store =
db.createObjectStore(
"photos",
{keyPath:"id"}
);


store.createIndex(
"date",
"date"
);


store.createIndex(
"album",
"album"
);


};



request.onsuccess=e=>{

db=e.target.result;

loadPhotos();

};




// камера

navigator.mediaDevices
.getUserMedia({
video:true
})
.then(stream=>{

video.srcObject=stream;

});





function makePhoto(){


let bigCanvas =
document.createElement("canvas");


bigCanvas.width=1280;
bigCanvas.height=720;


let ctx =
bigCanvas.getContext("2d");


ctx.drawImage(
video,
0,
0,
1280,
720
);



let big =
bigCanvas.toDataURL(
"image/webp",
0.8
);




// миниатюра


let smallCanvas =
document.createElement("canvas");


smallCanvas.width=200;
smallCanvas.height=200;


let s =
smallCanvas.getContext("2d");


s.drawImage(
video,
0,
0,
200,
200
);


let small =
smallCanvas.toDataURL(
"image/webp",
0.7
);



let item={


id:Date.now(),


small:small,


big:big,


album:
album.value || "Без альбома",


date:
new Date()
.toLocaleString()


};




let tx =
db.transaction(
"photos",
"readwrite"
);


tx.objectStore("photos")
.add(item);



show(item);


}






function show(p){


let box =
document.createElement("div");


box.className="card";


box.innerHTML=

<img class="photo"
src="${p.small}">

<div class="small">
${p.album}<br>
${p.date}
</div>

<button onclick="openPhoto(${p.id})">
Открыть
</button>

<button onclick="delPhoto(${p.id},this)">
Удалить
</button>

;



gallery.appendChild(box);


}





function loadPhotos(){


gallery.innerHTML="";


let tx =
db.transaction(
"photos",
"readonly"
);


tx.objectStore("photos")
.openCursor()
.onsuccess=e=>{


let c=e.target.result;


if(c){

show(c.value);

c.continue();

}

};


}





function openPhoto(id){


let tx =
db.transaction(
"photos",
"readonly"
);


tx.objectStore("photos")
.get(id)
.onsuccess=e=>{


let p=e.target.result;


let w =
window.open();


w.document.write(
<img src="${p.big}"
style="width:100%">
);


};


}




function delPhoto(id,el){


let tx =
db.transaction(
"photos",
"readwrite"
);


tx.objectStore("photos")
.delete(id);


el.parentElement.remove();

}





function searchPhotos(){


let text =
search.value
.toLowerCase();


let cards =
document.querySelectorAll(".card");


cards.forEach(c=>{


c.style.display =
c.innerText
.toLowerCase()
.includes(text)
?"block"
:"none";


});

}





function exportPhotos(){


alert(
"Для экспорта можно подключить сохранение на карту памяти"
);


}