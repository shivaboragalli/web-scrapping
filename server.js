const http = require('http');
const https = require('https');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const url = require('url');
const MONGODB_URI = process.env.MONGODB_URI;
var Schema = mongoose.Schema;
var linkDataSchema = new Schema({
  links: { type: Array, required: true },
  params: { type: Array }
}, { collection: 'link-data' });

var LinkData = mongoose.model('LinkData', linkDataSchema);
var scrappingDataList = [];
function getData() {
  var queue = [];
  for (var i = 0; i < 5; i++) {
    let scrappingData = new Promise((resolve, reject) => {
      https.get('https://medium.com/', function (res) {
        var body = '';
        res.on('data', function (chunk) {
          body += chunk;
        });
        res.on('end', function () {
          let $ = cheerio.load(body);
          let links = [];
          for (var k = 0; k < $('a').length; k++) {
            links.push($('a')[k].attribs.href)
          }
          let siteLinks = links.filter(function (link) {
            return link.startsWith('https://medium.com')
          })
          let queryObjArray = [];
          siteLinks.forEach((link) => {
            if (url.parse(link, true).search) {
              queryObjArray.push(url.parse(link, true).query)
            }
          })
          let cleanedLinks;
          let filteredLinks;
          let uniqLinks;
          cleanedLinks = siteLinks.map((link) => { return link.split('?') }).map((li) => { return li[0] });
          filteredLinks = cleanedLinks.map((item) => { return getOccurrence(cleanedLinks, item) });
          uniqLinks = [...new Set(filteredLinks)];
          let tempParams = [...new Set(queryObjArray.map(link => Object.keys(link)).reduce((acc, val) => acc.concat(val), []))];
          resolve({
            uniqLinks,
            uniqParams: tempParams
          })

        });

      }).on('error', function (e) {
        console.log("Got error: " + e.message);
        reject(e.message)
      });
    })
    queue.push(scrappingData);
  }
  Promise.all(queue).then((scrappingData) => {
    scrappingDataList = scrappingData;
    storeToDB(scrappingDataList[0])
  })
}

function getOccurrence(array, value) {
  var count = 0;
  array.forEach((v) => (v === value && count++));
  return { url: value, refCount: count };
}

function storeToDB(scrappingData, start = 0) {
  LinkData.find()
    .then((list) => {
      var mixedLinks;
      var mixedParams;
      if (list.links) {
        mixedLinks = list.links.concat(scrappingData.uniqLinks);
      } else {
        mixedLinks = scrappingData.uniqLinks;
      }
      if (list.params) {
        mixedParams = list.params.concat(scrappingData.uniqParams);
      } else {
        mixedParams = scrappingData.uniqParams;
      }
      let uniqLinks = [...new Set(mixedLinks.map(x => x.url))];
      let uniqParams = [...new Set(mixedParams)];
      let item = {
        links: uniqLinks,
        params: uniqParams
      }

      let linksArray = new LinkData(item);
      LinkData.deleteMany({}, () => {
        linksArray.save().then((data) => {
          if (start < scrappingDataList.length - 1) {
            storeToDB(scrappingDataList[start + 1], start + 1)
          }else{
            console.log('done')
          }

        });
      })

    }).catch(err => {
      console.log(err)
    });

}


mongoose
  .connect(MONGODB_URI, { useNewUrlParser: true })
  .then(result => {
    console.log('connection sucess')
    console.log("Running concurrent requests!")
    getData();
  })
  .catch(err => {
    console.log(err);
  });