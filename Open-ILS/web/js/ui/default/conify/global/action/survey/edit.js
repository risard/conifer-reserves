dojo.require('dojox.grid.DataGrid');
dojo.require('dojox.grid.cells.dijit');
dojo.require('dojo.data.ItemFileWriteStore');
dojo.require('dojo.date.stamp');
dojo.require('dijit.form.TextBox');
dojo.require('dijit.form.Button');
dojo.require('dijit.Dialog');
dojo.require('dojox.widget.PlaceholderMenuItem');
dojo.require('fieldmapper.OrgUtils');
dojo.require('openils.widget.OrgUnitFilteringSelect');
dojo.require('openils.PermaCrud');
dojo.require('openils.DojoPatch');
dojo.require('openils.widget.GridColumnPicker');
dojo.require('openils.widget.EditPane');

var surveyId;
var startDate;
var endDate;
var today;
function drawSurvey(svyId) {
    today = new Date();    
    var surveyTable = dojo.byId('edit-pane');
    var surveyHead = dojo.create('thead', {style: "background-color: #99CCFF", innerHTML: "Survey ID #" +svyId}, surveyTable);
    var pcrud = new openils.PermaCrud();
    var survey = pcrud.retrieve('asv', svyId);
    startDate = dojo.date.stamp.fromISOString(survey.start_date());
    endDate = dojo.date.stamp.fromISOString(survey.end_date());
    var pane = new openils.widget.EditPane({fmObject : survey, hideActionButtons:false}, dojo.byId('edit-pane'));
    if ( endDate > today) {
        var buttonBody = dojo.create( 'tbody', {innerHTML: "End Survey Now"}, surveyTable);
        var endButton = new dijit.form.Button({onClick:function() {endSurvey(survey.id())} }, buttonBody);
    }       
    pane.fieldOrder = ['id', 'name', 'description', 'owner', 'start_date', 'end_date'];
    pane.onCancel = cancelEdit;
    pane.startup();
    getQuestions(svyId, survey);

}

function cancelEdit(){
    document.location.href = "/eg/conify/global/action/survey";
}

function endSurvey(svyId) {
    var pcrud = new openils.PermaCrud();
    var survey = pcrud.retrieve('asv', svyId);
    var today = new Date();
    var date = dojo.date.stamp.toISOString(today);
    survey.end_date(date);
    survey.ischanged(true);
    return pcrud.update(survey);

}

// all functions for question manipulation

function getQuestions(svyId, survey) {
  
    surveyId = svyId;
      
    var pcrud = new openils.PermaCrud();
    var questions = pcrud.search('asvq', {survey:svyId});
    
    for(var i in questions) {
        questionId = questions[i].id(); 
        var answers = pcrud.search('asva', {question:questionId});
        if (answers)
            drawQuestionBody(questions[i], answers, survey);
    }
    if ( startDate > today) newQuestionBody(surveyId);
}
 
function newQuestionBody(svyId) {
    var surveyTable = dojo.byId("survey_table");
    var surveyBody = dojo.create('tbody', {style: "background-color: #d9e8f9"}, surveyTable);
    var questionRow = dojo.create('tr', null, surveyBody);
    var questionLabel = dojo.create('td',{ innerHTML: "Question"}, questionRow, "first");
    var questionTextbox = dojo.create('td', null, questionRow, "second");
    var qInput = new dijit.form.TextBox(null, questionTextbox);
    var questionButton = dojo.create('td', { innerHTML: "Save & Add Answers" }, questionRow);
    var qButton = new dijit.form.Button({onClick:function() {newQuestion(svyId, qInput.getValue(), questionRow)} }, questionButton);
    
}

function drawQuestionBody(question, answers, survey){

    var surveyTable = dojo.byId('survey_table');
    var surveyBody = dojo.create( 'tbody', {quid:question.id(), id:("q" + question.id()), style: "background-color: #d9e8f9"}, surveyTable);
    var questionRow = dojo.create('tr', {quid:question.id()}, surveyBody);
    var questionLabel = dojo.create('td', {quid:question.id(), innerHTML: "Question"}, questionRow, "first");
    var questionTextbox = dojo.create('td', {quid: question.id() }, questionRow, "second");
    var qInput = new dijit.form.TextBox(null, questionTextbox);
    qInput.attr('value', question.question());
    if (startDate > today){
        var questionButton = dojo.create('td', {quid: question.id(), innerHTML: "Delete Question & Answers" }, questionRow);
        var qButton = new dijit.form.Button({onClick:function() {deleteQuestion(question.id(), surveyBody) }}, questionButton);
        var qChangesButton = dojo.create('td', {quid: question.id(), innerHTML: "Save Changes" }, questionRow);
        var qcButton = new dijit.form.Button({onClick:function() {changeQuestion(question.id(), qInput.attr('value')) }}, qChangesButton);
       
    }
    for (var i in answers) {
        if(!answers) return'';
        drawAnswer(answers[i], question.id(), surveyBody, survey);
    }
    drawNewAnswerRow(question.id(), surveyBody);  
}

function newQuestion(svyId, questionText, questionRow) {
    var pcrud = new openils.PermaCrud();
    var question = new asvq();
    question.survey(svyId);
    question.question(questionText);
    question.isnew(true);
    pcrud.create(question, 
                 {oncomplete: function(r) 
                         { var q = openils.Util.readResponse(r); 
                             questionRow.parentNode.removeChild(questionRow);
                             drawQuestionBody(q, null);
                             newQuestionBody(svyId);
                         } 
                 }
                 ); 
}

function changeQuestion(quesId, questionText) {
    var pcrud = new openils.PermaCrud();
    var question = pcrud.retrieve('asvq', quesId);
    question.question(questionText);
    question.ischanged(true);
    return pcrud.update(question);
}

function deleteQuestion(quesId, surveyBody) {
    var pcrud = new openils.PermaCrud();
    var delQuestion = new asvq();
    var answers = pcrud.search('asva', {question:quesId});
    for(var i in answers){
        var ansId = answers[i].id();
        deleteAnswer(ansId);
    }
    delQuestion.id(quesId);
    delQuestion.isdeleted(true);
    surveyBody.parentNode.removeChild(surveyBody);
    return pcrud.delete(delQuestion);

}

// all functions for answer manipulation

function drawAnswer(answer, qid, surveyBody, survey) {
    var surveyBody = dojo.byId(("q" + qid)); 
    var answerRow = dojo.create('tr', {anid: answer.id(), style: "background-color: #FFF"}, surveyBody);
    var answerSpacer =  dojo.create('td', {anid: answer.id()}, answerRow, "first");
    var answerLabel =  dojo.create('td', {anid: answer.id(), style: "float: right", innerHTML: "Answer" }, answerRow, "second");
    var answerTextbox = dojo.create('td', {anid: answer.id() }, answerRow, "third");
    var input = new dijit.form.TextBox(null, answerTextbox);
    input.attr('value', answer.answer());
    if (startDate > today){
        var answerSpacer =  dojo.create('td', {anid: answer.id()}, answerRow);
        var delanswerButton = dojo.create('td', {anid: answer.id(), innerHTML: "Delete Answer" }, answerRow);
        var aid = answer.id();
        var aButton = new dijit.form.Button({onClick:function(){deleteAnswer(aid);answerRow.parentNode.removeChild(answerRow)} }, delanswerButton);
        var aChangesButton = dojo.create('td', {anid: qid, innerHTML: "Save Changes" }, answerRow);
        var acButton = new dijit.form.Button({onClick:function() {changeAnswer(answer.id(), input.attr('value')) }}, aChangesButton);
    }
}

function drawNewAnswerRow(qid, surveyBody) {
    var answerRow = dojo.create('tr', {quid: qid, style: "background-color: #FFF"}, surveyBody);
    var answerSpacer =  dojo.create('td', {quid: qid}, answerRow, "first");
    var answerLabel =  dojo.create('td', {quid: qid, innerHTML: "Answer", style: "float:right" }, answerRow, "second");
    var answerTextbox = dojo.create('td', {quid: qid }, answerRow, "third");
    var input = new dijit.form.TextBox(null, answerTextbox);
    var answerButton = dojo.create('td', {anid: qid, innerHTML: "Add Answer" }, answerRow);
    var aButton = new dijit.form.Button({onClick:function() {newAnswer(qid, input.attr('value'), answerRow, surveyBody)} }, answerButton);

}


function deleteAnswer(ansId) {
    var pcrud = new openils.PermaCrud();
    var delAnswer = new asva();
    delAnswer.id(ansId);
    delAnswer.isdeleted(true);
    return pcrud.delete(delAnswer);
  
}
function newAnswer(quesId, answerText, answerRow, surveyBody) {
    var pcrud = new openils.PermaCrud();
    var answer = new asva();
    answer.question(quesId);
    answer.answer(answerText);
    answer.isnew(true);
    answerRow.parentNode.removeChild(answerRow);
    drawAnswer(answer, answer.question());
    drawNewAnswerRow(quesId, surveyBody);
    return pcrud.create(answer);
}


function changeAnswer(ansId, answerText) {
    var pcrud = new openils.PermaCrud();
    var answer = pcrud.retrieve('asva', ansId);
    answer.answer(answerText);
    answer.ischanged(true);
    return pcrud.update(answer);
}






