var express = require('express')
var app = express()
var bodyParser = require('body-parser');

var HDWalletProvider = require("truffle-hdwallet-provider");
var constants = require("./constants");

var fs = require('fs');
var Web3 = require('web3');
var provider = new Web3.providers.HttpProvider("http://localhost:8545/");
// var provider = new HDWalletProvider(constants.mnemonic, "https://ropsten.infura.io/" + constants.infura_apikey);
var web3 = new Web3(provider);
var contract = require('truffle-contract');
var Hub, Proposal;
var hubInstance;
var account;

var twilio = require('twilio')(constants.twilioAccountNumber, constants.twilioAuthToken);
var fromNumber = constants.twilioFromNumber;
var testPhoneNumber = constants.testPhoneNumber

fs.readFile('build/contracts/Hub.json', (error, json) => {
    var json = JSON.parse(json);
    Hub = contract(json);
    Hub.setProvider(web3.currentProvider);
});

fs.readFile('build/contracts/ResourceProposal.json', (error, json) => {
    var json = JSON.parse(json);
    ResourceProposal = contract(json);
    ResourceProposal.setProvider(web3.currentProvider);
});

web3.eth.getAccounts(function(err, accs) {
    if (err != null) {
      alert("There was an error fetching your accounts.");
      return;
    }
    if (accs.length == 0) {
      alert("Couldn't get any accounts! Make sure your Ethereum client is configured correctly.");
      return;
    }

    accounts = accs;
    account = accounts[0];
    
    Hub.deployed().then(function(instance){
        hubInstance = instance;
        const messageEvent = hubInstance.LogNewProposal({},{fromBlock: 'latest'});
        messageEvent.watch(function(error, result){
            sendMessages(result.args.pid, result.args.text);                          
        });
        console.log('watching');
        castVote("1234",1,true);
    });
});

var sendMessages = function(proposalId, text){
    hubInstance.getMembers({from:account}).then(function(members){
        for(var i=0; i<members.length; i++){
            hubInstance.memberNumbers(members[i], {from:account}).then(function(number){
                sendMessage(proposalId, text, number);
            })
        }
    })      
}

var sendMessage = function(proposalId, text, number){
    console.log('Sending message to: ', number);
    const messageText = "Proposal: \"" + text + "\" respond with \"Y" + proposalId + "\" to vote yes, \"N" + proposalId + "\" to vote no, or \"A" + proposalId + "\" to abstain.";
    // twilio.messages.create({
    //     to: "+"+number,
    //     from: fromNumber,
    //     body: messageText,
    // }, function(err, message) {
    //     console.log(err)
    //     console.log(message);
    // });
}

var castVote = function(user, proposalId, vote){
    const proposalEvent = hubInstance.LogNewProposal({pid:proposalId},{fromBlock: 0, toBlock: 'latest'});
    proposalEvent.watch(function(error, result){
        const propAddress = result.args.proposalAddress;
        console.log("address: ", propAddress);
        console.log(result);
        ResourceProposal.at(propAddress).then(function(instance){
            instance.castVote(vote, {from:account}).then(function(tx){
                console.log(tx);
            })
        })
    });
}

app.set('port', (process.env.PORT || 3000))
app.use(express.static(__dirname + '/public'))
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));

app.get('/', function(request, response) {
    console.log('creating proposal')
    hubInstance.createResourceProposal("0xE0432C23Eb6d243413A88DdC71eB8B8af9b87c53", 500, 10, 500, "We should stage a coup against John.", {from:account, gas: 1000000})
    .then(function(tx){
        console.log("proposal created");
    })
    response.send('Hello World!')
})

app.get('/register', function(req, res){
    console.log('registering');
    hubInstance.register(constants.testPhoneNumber, {from:account, value: 100}).then(function(tx){
        console.log(tx);
    });
    res.send('Registration');
})

const MessagingResponse = require('twilio').twiml.MessagingResponse;

app.post('/sms', (req, res) => {
    console.log(req.body);
    const response = req.body.Body;
    const rawVote = response[0];
    const proposal = parseInt(response.substring(1,response.length-1));
    let vote = -1;
    if(rawVote == 'a' || rawVote == 'A') vote = 0;
    if(rawVote == 'y' || rawVote == 'Y') vote = 1;
    if(rawVote == 'n' || rawVote == 'N') vote = 2;
    let message;

    if(isNaN(proposal)){
        message = "Invalid response. Please respond with a proposal number."
    }else if(vote == -1){
        message = "Invalid response. Please respond with A, Y, or N."
    }else{
        if(vote == 0){
            message = "You abstained on proposal" + proposal + ".";
        }else if(vote == 1){
            message = "You voted yes on proposal" + proposal + ".";
        }else{
            message = "You voted no on proposal" + proposal + ".";
        }
        castVote(constants.testPhoneNumber, proposal, vote);
    }

    const twiml = new MessagingResponse();
    twiml.message(message);
    res.writeHead(200, {'Content-Type': 'text/xml'});
    res.end(twiml.toString());
});

app.listen(app.get('port'), function() {
    console.log("Node app is running at localhost:" + app.get('port'))
})