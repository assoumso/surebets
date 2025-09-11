const fs = require('fs');
const path = require('path');
const playwright = require('playwright');
const axios = require('axios');
const cheerio = require('cheerio');

const urlMap = {
  'yesterday': 'https://www.mybets.today/soccer-predictions/yesterday/',
  'today': 'https://www.mybets.today/soccer-predictions/',
  'tomorrow': 'https://www.mybets.today/soccer-predictions/tomorrow/',
  'after-tomorrow': 'https://www.mybets.today/soccer-predictions/after-tomorrow/'
};

async function analyze(dateStr = new Date().toISOString().split('T')[0]) {
  const inputDate = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  inputDate.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((inputDate - today) / (1000 * 60 * 60 * 24));
  let dateParam;
  switch (diffDays) {
    case -1: dateParam = 'yesterday'; break;
    case 0: dateParam = 'today'; break;
    case 1: dateParam = 'tomorrow'; break;
    case 2: dateParam = 'after-tomorrow'; break;
    default: throw new Error('Date non supportée');
  }

  const url = urlMap[dateParam];

  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    const matches = [];
    $('.event-fixtures a').each((i, el) => {
      matches.push({ link: $(el).attr('href') });
    });

    const resultsPromises = matches.map(async (match) => {
      try {
        const detailResponse = await axios.get(match.link);
        const $$ = cheerio.load(detailResponse.data);
        
        let time = 'N/A';
        $$('p').each((i, p) => {
          const text = $$(p).text();
          const matchTime = text.match(/kicks off at (\d{2}:\d{2})/);
          if (matchTime) time = matchTime[1];
        });

        const pageContent = $$('body').text();
        
        const scoreProbMatch = pageContent.match(/says (\d+:\d+) to be the exact final score with (\d+)%/);
        const correctScore = scoreProbMatch ? scoreProbMatch[1] : 'N/A';
        const correctScoreProb = scoreProbMatch ? parseFloat(scoreProbMatch[2]) : 0;

        const layProbMatch = pageContent.match(/the exact final score with (\d+)%/);
        const layProb = layProbMatch ? parseFloat(layProbMatch[1]) : 0;

        const bttsRegex = /have a Yes in both teams have scored in (\d+)% of the games in their last 10 games\./g;
        const bttsMatches = [...pageContent.matchAll(bttsRegex)];
        let team1Btts = bttsMatches[0] ? parseFloat(bttsMatches[0][1]) : 0;
        let team2Btts = bttsMatches[1] ? parseFloat(bttsMatches[1][1]) : 0;
        const bttsProb = (team1Btts + team2Btts) / 2;

        const formRegex = /PRE GAME FORM\s+([WLWD]{5})\s+([WLWD]{5})/;
        const formMatch = pageContent.match(formRegex);
        const team1Form = formMatch ? formMatch[1] : 'N/A';
        const team2Form = formMatch ? formMatch[2] : 'N/A';

        const overRegex = /have Over 2\.5 goals scored in (\d+)% of the games in their last 10 games\./g;
        const overMatches = [...pageContent.matchAll(overRegex)];
        const team1Over = overMatches[0] ? parseFloat(overMatches[0][1]) : 0;
        const team2Over = overMatches[1] ? parseFloat(overMatches[1][1]) : 0;

        const cleanRegex = /kept a clean sheet in (\d+)% of the games in their last 10 games\./g;
        const cleanMatches = [...pageContent.matchAll(cleanRegex)];
        const team1Clean = cleanMatches[0] ? parseFloat(cleanMatches[0][1]) : 0;
        const team2Clean = cleanMatches[1] ? parseFloat(cleanMatches[1][1]) : 0;

        const MatchsA = 10;
        const MatchsB = 10;
        const CleanSheetsA = (team1Clean / 100) * MatchsA;
        const CleanSheetsB = (team2Clean / 100) * MatchsB;
        const basicGoalProb = 1 - ((CleanSheetsA + CleanSheetsB) / (MatchsA + MatchsB));

        const formToScore = (form) => form.split('').reduce((acc, res) => acc + (res === 'W' ? 1.5 : res === 'D' ? 1 : 0.5), 0) / 5;
        const lambdaTeam1 = (team1Over / 100 * 3) + formToScore(team1Form) * 0.5;
        const lambdaTeam2 = (team2Over / 100 * 3) + formToScore(team2Form) * 0.5;
        const lambdaTeam1Half = lambdaTeam1 * 0.45;
        const lambdaTeam2Half = lambdaTeam2 * 0.45;
        const probNoGoalFirstHalf = Math.exp(-lambdaTeam1Half) * Math.exp(-lambdaTeam2Half);
        const firstHalfGoalProb = (1 - probNoGoalFirstHalf) * 100;
        const probNoGoalTeam1 = Math.exp(-lambdaTeam1);
        const probNoGoalTeam2 = Math.exp(-lambdaTeam2);
        const probAnyGoals = 1 - (probNoGoalTeam1 * probNoGoalTeam2);
        const goalProb = (basicGoalProb + probAnyGoals) / 2;

        let otherProb = 0;
        $$('.predictionlabel').each((i, el) => {
          if ($$(el).text().trim() === 'Other') {
            otherProb = parseFloat($$(el).next().text().replace('%', ''));
          }
        });

        return { match: match.link, time, correctScore, correctScoreProb, layProb, bttsProb, otherProb, date: dateStr, team1Form, team2Form, team1Over, team2Over, goalProb, firstHalfGoalProb };
      } catch (error) {
        console.error(`Error processing match ${match.link}: ${error.message}`);
        return null;
      }
    });

    const results = (await Promise.all(resultsPromises)).filter(result => result !== null);
    return results;
  } catch (error) {
    console.error('Error in main scraping process:', error);
    throw error;
  }
}

if (require.main === module) {
  (async () => {
    try {
      const results = await analyze(process.argv[2]);
      console.log(JSON.stringify(results, null, 2));
    } catch (error) {
      console.error(error);
    }
  })();
}

module.exports = { analyze };