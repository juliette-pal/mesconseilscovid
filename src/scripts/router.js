var Navigo = require('navigo')

var introduction = require('./introduction.js')
var affichage = require('./affichage.js')
var conseils = require('./conseils.js')
var questionnaire = require('./questionnaire.js')
var profils = require('./profils.js')
var injection = require('./injection.js')
var pagination = require('./pagination.js')

function initRouter(app) {
    var root = null
    var useHash = true
    var router = new Navigo(root, useHash)

    // Workaround unwanted behaviour in Navigo
    if (router.root.slice(-1) !== '/') {
        router.root = router.root + '/'
    }

    router.hooks({
        before: function (done) {
            // Global hook to redirect on the correct page given registered data.
            var requestedPage = pagination.getCurrentPageName() || 'introduction'
            var redirectedPage = pagination.redirectToUnansweredQuestions(
                requestedPage,
                app.profil
            )
            if (redirectedPage) {
                router.navigate(redirectedPage)
            }
            var header = document.querySelector('header section')
            if (app.profil.isEmpty()) {
                affichage.showElement(header.querySelector('#js-profil-empty'))
                affichage.hideElement(header.querySelector('#js-profil-full'))
            } else {
                affichage.showElement(header.querySelector('#js-profil-full'))
                affichage.hideElement(header.querySelector('#js-profil-empty'))
                injection.nomProfil(header.querySelector('#nom-profil'), app)
            }
            done()
        },
        after: function () {
            // Global hook to send a custom event on each page change.
            var pageName = pagination.getCurrentPageName()
            var customPageEvent = document.createEvent('CustomEvent')
            customPageEvent.initCustomEvent(
                'pageChanged:' + pageName,
                true,
                true,
                pageName
            )
            document.dispatchEvent(customPageEvent)
        },
    })

    router
        .on(new RegExp('^profils$'), function () {
            if (app.profil.isEmpty()) {
                router.navigate('introduction')
            }
            var pageName = 'profils'
            var element = pagination.loadPage(pageName)
            profils.page(element, app)
        })
        .on(new RegExp('^introduction$'), function () {
            var pageName = 'introduction'
            var element = pagination.loadPage(pageName)
            introduction.page(element, app)
        })
        .on(new RegExp('^residence$'), function () {
            var pageName = 'residence'
            var form = pagination.loadPage(pageName)
            questionnaire.residence(form, app, router)
        })
        .on(new RegExp('^activitepro$'), function () {
            var pageName = 'activitepro'
            var form = pagination.loadPage(pageName)
            questionnaire.activitepro(form, app, router)
        })
        .on(new RegExp('^foyer$'), function () {
            var pageName = 'foyer'
            var form = pagination.loadPage(pageName)
            questionnaire.foyer(form, app, router)
        })
        .on(new RegExp('^caracteristiques$'), function () {
            var pageName = 'caracteristiques'
            var form = pagination.loadPage(pageName)
            questionnaire.caracteristiques(form, app, router)
        })
        .on(new RegExp('^antecedents$'), function () {
            var pageName = 'antecedents'
            var form = pagination.loadPage(pageName)
            questionnaire.antecedents(form, app, router)
        })
        .on(new RegExp('^symptomesactuels$'), function () {
            var pageName = 'symptomesactuels'
            var form = pagination.loadPage(pageName)
            questionnaire.symptomesactuels(form, app, router)
        })
        .on(new RegExp('^symptomespasses$'), function () {
            var pageName = 'symptomespasses'
            var form = pagination.loadPage(pageName)
            questionnaire.symptomespasses(form, app, router)
        })
        .on(new RegExp('^contactarisque$'), function () {
            var pageName = 'contactarisque'
            var form = pagination.loadPage(pageName)
            questionnaire.contactarisque(form, app, router)
        })
        .on(new RegExp('^conseils$'), function () {
            var pageName = 'conseils'
            var element = pagination.loadPage(pageName)
            conseils.page(element, app)
        })
        .on(new RegExp('^pediatrie$'), function () {
            var pageName = 'pediatrie'
            var element = pagination.loadPage(pageName)
            if (app.profil.isComplete()) {
                affichage.showElement(element.querySelector('#js-profil-full'))
                affichage.hideElement(element.querySelector('#js-profil-empty'))
                var mesConseilsLink = element.querySelector('#mes-conseils-link')
                var target = pagination.redirectToUnansweredQuestions(
                    'findCorrectExit',
                    app.profil
                )
                mesConseilsLink.setAttribute('href', '#' + target)
            }
        })
        .on(new RegExp('^conditionsutilisation$'), function () {
            var pageName = 'conditionsutilisation'
            pagination.loadPage(pageName)
        })
        .on(new RegExp('^nouvelleversiondisponible$'), function () {
            var pageName = 'nouvelleversiondisponible'
            pagination.loadPage(pageName)
        })
        .notFound(function () {
            router.navigate('introduction')
        })

    return router
}

module.exports = {
    initRouter,
}
