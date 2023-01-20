
//Load libraries
const axios = require('axios')
const express = require('express')
var url = require('url')
const app = express()
const xsenv = require('@sap/xsenv')
const https = require('https');
// const rp = require('request-promise');
xsenv.loadEnv();
var queryParam;
//to get data from VCAP_SERVICES:: Applications running in Cloud Foundry gain access 
//to the bound service instances via credentials stored in an environment variable called VCAP_SERVICES.
// const VCAP_SERVICES = JSON.parse(process.env.VCAP_SERVICES);
// const destSrvCred = VCAP_SERVICES.destination[0].credentials;
// const conSrvCred = VCAP_SERVICES.connectivity[0].credentials;

const destSrvCred = xsenv.getServices({ dest: { tag: 'destination' } }).dest;
// const uaa_service = xsenv.getServices({ uaa: { tag: 'xsuaa' } }).uaa;
const conSrvCred = xsenv.getServices({ conn: { tag: 'connectivity' } }).conn;

//console.log('botNodeJS application started')
// app.listen(process.env.PORT, function () {
//     console.log('botNodeJS application started')
// })

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Listening on Port http://localhost:${PORT}`)
})

//to fetch auth token using URL, client and secret values
const _fetchJwtToken = async function (oauthUrl, oauthClient, oauthSecret) {
    return new Promise((resolve, reject) => {
        //prepare URL
        const tokenUrl = oauthUrl + '/oauth/token?grant_type=client_credentials&response_type=token'
        //prepare for the call
        const config = {
            headers: {
                Authorization: "Basic " + Buffer.from(oauthClient + ':' + oauthSecret).toString("base64")
            },
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            }),
        }
        //backend get call to fetch auth token
        axios.get(tokenUrl, config)
            .then(response => {
                resolve(response.data.access_token)
            })
            .catch(error => {
                reject(error)
            })
    })
}

// Reads Destination configuration based on destinationName, destUri(fetched from VCAP_SERVICES) 
// and jwtToken(fetched from _fetchJwtToken) . Result will be an object with Destination Configuration info 
const _readDestinationConfig = async function (destinationName, destUri, jwtToken) {
    return new Promise((resolve, reject) => {
        //prepare URL
        const destSrvUrl = destUri + '/destination-configuration/v1/destinations/' + destinationName
        console.log(destSrvUrl);
        // preparation for the call
        const config = {
            headers: {
                Authorization: 'Bearer ' + jwtToken
            },
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            }),
        }
        //backend get call to fetch destination config
        axios.get(destSrvUrl, config)
            .then(response => {
                resolve(response.data.destinationConfiguration)
            })
            .catch(error => {
                reject(error)
            })
    })
}
//podetails: entity using which application exposes the PO Data
app.get('/podetails', async function (req, res) {
    
    // call destination service //
    //fetch detination auth token
    const destJwtToken = await _fetchJwtToken(destSrvCred.url, destSrvCred.clientid, destSrvCred.clientsecret)
    //read destination config
    const destiConfi = await _readDestinationConfig('ES5VirtualBasicWurl', destSrvCred.uri, destJwtToken)
    //to fetch query parameter from URL
    queryParam = url.parse(req.url, true).query;

    // call onPrem/Remote system using the connectivity service via the Cloud Connector//
    // fetch connectivity auth token
    const connJwtToken = await _fetchJwtToken(conSrvCred.token_service_url, conSrvCred.clientid, conSrvCred.clientsecret)
    try {
        // method to make a call to onPrem/Remote system, and save the result in variable "result"
        const result = await _poDetails(conSrvCred.onpremise_proxy_host, conSrvCred.onpremise_proxy_http_port, connJwtToken, destiConfi)
        res.json(result);
    }
    //catch block to handle any errors
    catch (e) {
        
        console.log('Catch an error: ', e)
        res.json({ "d": { "error": "error" } })
    }
})
//to make a backend call to the onPrejm/Remote system using connProxyHost, connProxyPort, ConnJwtToken (fetched 
//using the connectivity service) and destiConfi (destination configuration fetched using destination service)
const _poDetails = async function (connProxyHost, connProxyPort, connJwtToken, destiConfi) {
    return new Promise((resolve, reject) => {
        // make target URL 
        // const targetUrl = destiConfi.URL + "/C_PurchaseOrderTP(PurchaseOrder='" + queryParam.number + "',DraftUUID=guid'00000000-0000-0000-0000-000000000000',IsActiveEntity=true)"
        // const targetUrl = destiConfi.URL + "/SalesOrderSet('0500000001')/ToLineItems"
        const targetUrl = destiConfi.URL + "/SalesOrderSet('0500000001')"
        console.log(targetUrl)
        //encode user creds fetched from the destination configuration
        const encodedUser = Buffer.from(destiConfi.User + ':' + destiConfi.Password).toString("base64")
        //preparation for the  onPrem/Remote  system call
        const config = {
            headers: {
                Authorization: "Basic " + encodedUser,
                'Proxy-Authorization': 'Bearer ' + connJwtToken,
                'SAP-Connectivity-SCC-Location_ID': destiConfi.CloudConnectorLocationId
                // 'SAP-Connectivity-SCC-Location_ID': ''
            },
            proxy: {
                host: connProxyHost,
                port: connProxyPort
            },
            httpsAgent: new https.Agent({
                rejectUnauthorized: false,
                keepAlive: true, keepAliveMsecs: 60000
            }),
        }
        // get call to the onPrem/Remote system to fetch data
        axios.get(targetUrl, config)
            .then(response => {
                resolve(response.data)
            })
            .catch(error => {
                reject(error)
            })


        // return rp({
        //     method: 'GET',
        //     uri: targetUrl,
        //     config
        // });


    })
}
//prdetails: entity using which application exposes the PR Data
app.get('/prdetails', async function (req, res) {
    // call destination service 
    //fetch detination auth token
    const destJwtToken = await _fetchJwtToken(destSrvCred.url, destSrvCred.clientid, destSrvCred.clientsecret)
    //read destination config
    const destiConfi = await _readDestinationConfig('ES5VirtualBasicWurl', destSrvCred.uri, destJwtToken)
    //to fetch query parameter from URL
    queryParam = url.parse(req.url, true).query;

    // call onPrem/Remote system using the connectivity service via the Cloud Connector//
    // fetch connectivity auth token
    const connJwtToken = await _fetchJwtToken(conSrvCred.token_service_url, conSrvCred.clientid, conSrvCred.clientsecret)
    try {
        // method to make a call to onPrem/Remote system, and save the result in variable "result"
        const result = await _prDetails(conSrvCred.onpremise_proxy_host, conSrvCred.onpremise_proxy_http_port, connJwtToken, destiConfi)
        res.json(result);
    }
    //catch block to handle any errors
    catch (e) {
        console.log('Catch an error: ', e)
        res.json({ "d": { "error": "error" } })
    }
})
//to make a backend call to the onPrem/Remote system using connProxyHost, connProxyPort, ConnJwtToken (fetched 
//using the connectivity service) and destiConfi (destination configuration fetched using destination service)
const _prDetails = async function (connProxyHost, connProxyPort, connJwtToken, destiConfi) {
    return new Promise((resolve, reject) => {
        // make target URL 
        //const targetUrl = destiConfi.URL + "/C_PurchaseReqnHeader(PurchaseRequisition='" + queryParam.number + "',DraftUUID=guid'00000000-0000-0000-0000-000000000000',IsActiveEntity=true)"
        const targetUrl = destiConfi.URL + "/SalesOrderSet('0500000001')/ToLineItems"
        //encode user creds fetched from the destination configuration
        const encodedUser = Buffer.from(destiConfi.User + ':' + destiConfi.Password).toString("base64")
        //preparation for the  onPrem/Remote  system call
        const config = {
            headers: {
                Authorization: "Basic " + encodedUser,
                'Proxy-Authorization': 'Bearer ' + connJwtToken,
                'SAP-Connectivity-SCC-Location_ID': destiConfi.CloudConnectorLocationId
            },
            proxy: {
                host: connProxyHost,
                port: connProxyPort
            }
        }
        // get call to the onPrem/Remote system to fetch data
        axios.get(targetUrl, config)
            .then(response => {
                resolve(response.data)
            })
            .catch(error => {
                reject(error)
            })
    })

}
//sodetails: entity using which application exposes the SO Data
app.get('/sodetails', async function (req, res) {
    var destinationNames = 'ES5VirtualBasicWurl';
    // call destination service //
    //fetch detination auth token
    const destJwtToken = await _fetchJwtToken(destSrvCred.url, destSrvCred.clientid, destSrvCred.clientsecret)
    //read destination config
    const destiConfi = await _readDestinationConfig( destinationNames, destSrvCred.uri, destJwtToken)
    //to fetch query parameter from URL
    queryParam = url.parse(req.url, true).query;

    // call onPrem/Remote system using the connectivity service via the Cloud Connector//
    // fetch connectivity auth token
    const connJwtToken = await _fetchJwtToken(conSrvCred.token_service_url, conSrvCred.clientid, conSrvCred.clientsecret)
    try {
        // method to make a call to onPrem/Remote system, and save the result in variable "result"
        const result = await _soDetails(conSrvCred.onpremise_proxy_host, conSrvCred.onpremise_proxy_http_port, connJwtToken, destiConfi)
        res.json(result);
    }
    //catch block to handle any errors
    catch (e) {
        console.log('Catch an error: ', e)
        res.json({ "d": { "error": "error" } })
    }
})
//to make a backend call to the onPrejm/Remote system using connProxyHost, connProxyPort, ConnJwtToken (fetched 
//using the connectivity service) and destiConfi (destination configuration fetched using destination service)
const _soDetails = async function (connProxyHost, connProxyPort, connJwtToken, destiConfi) {
    return new Promise((resolve, reject) => {
        // make target URL 
        //const targetUrl = destiConfi.URL + "/zabibot01('" + queryParam.number + "')"
        const targetUrl = destiConfi.URL + "/SalesOrderSet('0500000001')/ToLineItems"
        //encode user creds fetched from the destination configuration
        const encodedUser = Buffer.from(destiConfi.User + ':' + destiConfi.Password).toString("base64")
        //preparation for the  onPrem/Remote  system call
        const config = {
            headers: {
                Authorization: "Basic " + encodedUser,
                'Proxy-Authorization': 'Bearer ' + connJwtToken,
                'SAP-Connectivity-SCC-Location_ID': destiConfi.CloudConnectorLocationId
            },
            proxy: {
                host: connProxyHost,
                port: connProxyPort
            }
        }
        // get call to the onPrem/Remote system to fetch data
        axios.get(targetUrl, config)
            .then(response => {
                resolve(response.data)
            })
            .catch(error => {
                reject(error)
            })
    })
}