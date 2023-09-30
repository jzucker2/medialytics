// CONFIG
const serverIp = 'SERVER_IP',// ex: 'http://12.345.678.90:32400'
serverToken = 'PLEX_TOKEN',// ex: 'ad2T-askdjasd9WxJVBPQ'
libraryListUrl = serverIp + '/library/sections?X-Plex-Token=' + serverToken,
decadePrefixes = ["193", "194", "195", "196", "197", "198", "199", "200", "201", "202"],
decades = ["1930s", "1940s", "1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"],
// moviesPayloadUrl = serverIp + '/library/sections/1/all?X-Plex-Token=' + serverToken,
// tvPayloadUrl = serverIp + '/library/sections/2/all?X-Plex-Token=' + serverToken,
recentLimit = 20,
recentlyAddedUrl = serverIp + '/library/recentlyAdded/search?type=1&X-Plex-Container-Start=0&X-Plex-Container-Size=' + recentLimit + '&X-Plex-Token=' + serverToken;

// GLOBAL VARIABLES
let availableLibraries = [],
selectedLibrary = "",
selectedLibraryStats = {},
selectedLibrarySummary = "",
libraryStatsLoading = false;

/////////////////////////////////
// gets list of available libraries
const parseLibraryList = (data) => {
    let libraries = [];
    data.MediaContainer.Directory.forEach((library) => {
        // restrict to only movie and tv show libraries
        if (library.type != 'movie' && library.type != 'show') {
            return;
        } else {
            libraries.push({
                title: library.title,
                key: library.key
            });
        }
    });
    console.log('libraries:', libraries);
    return libraries;
}

/////////////////////////////////
// sets selectedLibrary, passes all data for that library to a parsing function
const getLibraryData = async (libraryKey) => {
    app.availableLibraries.forEach((library) => {
        if (library.key == libraryKey) {
            app.selectedLibrary = library.title;
            console.log('selected = ' + app.selectedLibrary);
        }
    });
    app.libraryStatsLoading = true;
    let libraryData = await axios.get(serverIp + '/library/sections/' + libraryKey + '/all?X-Plex-Token=' + serverToken).then((response) => {
        console.log('library stats XML:', response.data);
        parseMediaPayload(response);
        app.libraryStatsLoading = false;
        return response.data.MediaContainer;
    });
    console.log('libraryData:', libraryData);
    return libraryData;
}

/////////////////////////////////
// parse through a media payload
const parseMediaPayload = (data) => {
    let itemCount = data.data.MediaContainer.size,
        type = data.data.MediaContainer.viewGroup;
    
    console.log('parsing media payload...');
    console.log('count = ' + itemCount);
    
    // loop through items and gather important data
    data.data.MediaContainer.Metadata.forEach((item, index) => {
        // track year
        releaseDateList.push(item.year);
        // track studio
        studioInstances.push(item.studio);
        // track durations
        if (isNaN(item.duration)) {
            // duration is NaN
        } else if (type === 'show') {
            // track seasons
            seasonSum = seasonSum + item.childCount;
            // multiply the avg episode length by the number of episodes to approximate total duration
            durationSum = durationSum + (item.duration/60000 * item.leafCount);
            // track number of episodes
            episodeCounts.push(parseInt(item.leafCount));
        } else {
            // it's a movie
            durationSum = durationSum + (item.duration/60000);
        }
        // track genres
        if (item.Genre) {
            item.Genre.forEach((genre) => {
                if (genres.hasOwnProperty(genre.tag)) {
                    // if genre exists in the dictionary already,
                    // find the genre and increment the count
                    genres[genre.tag]++;
                } else {
                    genres[genre.tag] = 1;
                }
            });
        } else {
            // no genres
        }
        // track countries
        if (item.Country) {
            // check if a country exists for movie
            item.Country.forEach((country) => {
                if (countries.hasOwnProperty(country.tag)) {
                    // if country exists in the dictionary already,
                    // find the country and increment the count
                    countries[country.tag]++;
                } else {
                    countries[country.tag] = 1;
                }
            });
        } else {
            // no countries
        }
        
        if (index == itemCount - 1) {
            //////////////////////////
            // if it's the last entry, calculate stats and prepare data for charts
            if (type === 'show') {
                let seasonDurations = [];
                
                durationList.forEach((duration, i) => {
                    // multiply each season's avg ep duration by the number of eps
                    let seasonDur = duration * episodeCounts[i];
                    seasonDurations.push(seasonDur);
                });
                totalDuration = seasonDurations.reduce(function(acc, val) { return acc + val; }, 0);
                episodeSum = episodeCounts.reduce(function(acc, val) { return acc + val; }, 0);
            }
            
            let totalMins = Math.round(durationSum),
                totalHours = Math.floor(durationSum/60),
                totalDays = Math.floor(durationSum/24/60),
                displayHours = totalHours - (totalDays*24),
                displayMins = totalMins - (totalHours*60);

            //////////////////////////
            // after basic parsing is complete, manipulate data to make
            // it logical and palatable for d3/c3 charting library.
            // Bar charts want 2 arrays of values, while pie charts want a dictionary / object
            
            //////////////////////////
            // items by country chart
            let sortedCountries = [];
            // choosing not to report on undefined entries
            delete countries['undefined'];
            for (country in countries) {
                sortedCountries.push([country, countries[country]]);
            }
            sortedCountries.sort(function(a, b) {
                return b[1] - a[1];
            })
            for (property in sortedCountries) {
                // split the countries dictionary into an array of countries and an array of counts
                countryList.push(sortedCountries[property][0]);
                countryCounts.push(sortedCountries[property][1]);
            }
            countryCounts.unshift("countryCounts");

            ////////////////////////
            // items by genre chart
            let sortedGenres = [];
            // choosing not to report on undefined entries
            delete genres['undefined'];
            for (genre in genres) {
                sortedGenres.push([genre, genres[genre]]);
            }
            sortedGenres.sort(function(a, b) {
                return b[1] - a[1];
            })
            // split the sorted genres dictionary into an array of genres and an array of counts
            for (property in sortedGenres) {
                genreList.push(sortedGenres[property][0]);
                genreCounts.push(sortedGenres[property][1]);
            }

            genreCounts.unshift("genreCounts");

            /////////////////////////
            // items by decade chart
            // remove undefined entries from releaseDateList
            releaseDateList.forEach((year) => {
                if (typeof year !== 'number' || isNaN(year)) {
                    releaseDateList.pop(year);
                } else {
                    // compare each year to the decadePrefixes array, and if the first 3 chars of the year match the decade prefix,
                    // increment the corresponding index in releaseDateCounts
                    let yearSub = year.toString().substring(0, 3);
                    for (let i = 0; i < decadePrefixes.length; i++) {
                        if (yearSub == decadePrefixes[i]) {
                            releaseDateCounts[i]++;
                        }
                    }
                }
            });

            console.log('releaseDateCounts is:');
            console.dir(releaseDateCounts);
            let topDecade = decades[releaseDateCounts.indexOf(Math.max(...releaseDateCounts))],
                topDecadeCount = Math.max(...releaseDateCounts).toLocaleString();
            releaseDateCounts.unshift("releaseDateCounts");

            ////////////////////////
            // items by studio chart
            let studios = {};
            // build a dictionary of studios and their counts
            studioInstances.forEach((studio) => {
                if (studios.hasOwnProperty(studio)) {
                    studios[studio]++;
                } else {
                    studios[studio] = 1;
                }
            });

            // remove undefined entries from studioInstances
            delete studios['undefined'];
            // sort the studios dictionary by count
            for (studio in studios) {
                sortedStudios.push([studio, studios[studio]]);
            }
            sortedStudios.sort(function(a, b) {
                return b[1] - a[1];
            });
            console.log('sortedStudios:');
            console.dir(sortedStudios);
            // trim the sorted studios to the predefined limit
            sortedStudios = sortedStudios.slice(0, studioLimit);

            // build the stats object for the selected library
            app.selectedLibraryStats = {
                totalItems: itemCount,
                totalDays: totalDays,
                displayHours: totalHours - (totalDays*24),
                displayMins: totalMins - (totalHours*60),
                topGenre: genreList[0],
                topGenreCount: genreCounts[1].toLocaleString(),
                topCountry: countryList[0],
                topCountryCount: countryCounts[1].toLocaleString(),
                topDecade: topDecade,
                topDecadeCount: topDecadeCount,
                sortedStudios: sortedStudios,
                topStudio: sortedStudios[0][0],
                topStudioCount: sortedStudios[0][1].toLocaleString(),
                type: type,
                increment: type === 'movie'? 'movies' : 'shows',
                totalDuration: totalDays + " Days, " + displayHours + " Hours and " + displayMins + " Mins",
                seasonSum: seasonSum,
                episodeSum: episodeSum,
                studioLimit: studioLimit,
                countryLimit: countryLimit,
                genreLimit: genreLimit
            }

            // set concatenated summary string
            app.selectedLibrarySummary = type === 'movie' ?
                // movies
                `This library contains ${app.selectedLibraryStats.totalItems.toLocaleString()}
                ${app.selectedLibraryStats.increment} produced by ${app.selectedLibraryStats.sortedStudios.length.toLocaleString()} studios
                across ${Object.keys(countries).length.toLocaleString()} countries spanning ${Object.keys(genres).length.toLocaleString()}
                genres. The total duration is ${app.selectedLibraryStats.totalDuration}.` :
                // tv
                `This library contains ${app.selectedLibraryStats.totalItems.toLocaleString()} ${app.selectedLibraryStats.increment} produced by
                ${app.selectedLibraryStats.sortedStudios.length.toLocaleString()} studios across
                (${app.selectedLibraryStats.seasonSum.toLocaleString()} seasons / ${app.selectedLibraryStats.episodeSum.toLocaleString()} episodes)
                ${Object.keys(countries).length.toLocaleString()} countries spanning ${Object.keys(genres).length.toLocaleString()} genres.
                The total duration is ${app.selectedLibraryStats.totalDuration}.`
                console.log('final stats:');
                console.log(app.selectedLibraryStats);

            console.log('selectedLibraryStats');
            console.dir(app.selectedLibraryStats);
            // render charts
            renderCharts();
        }
    });

}

const renderCharts = () => {
    // render charts
    c3.generate({
        bindto: '.items-by-country',
        x: 'x',
        data: {
            columns: [
                countryCounts.slice(0, countryLimit)
            ],
            type: 'bar'
        },
        axis: {
            rotated: true,
            x: {
                type: 'category',
                categories: countryList.slice(0, countryLimit)
            }
        },
        legend: {
            hide: true
        },
        color: {
            pattern: ['#D62828', '#F75C03', '#F77F00', '#FCBF49', '#EAE2B7']
        }
    });
    c3.generate({
        bindto: '.items-by-genre',
        x: 'x',
        data: {
            columns: [
                genreCounts.slice(0, genreLimit)
            ],
            type: 'bar'
        },
        axis: {
            rotated: true,
            x: {
                type: 'category',
                categories: genreList.slice(0, genreLimit)
            }
        },
        legend: {
            hide: true
        },
        color: {
            pattern: ['#D62828', '#F75C03', '#F77F00', '#FCBF49', '#EAE2B7']
        }
    });
    c3.generate({
        bindto: '.items-by-decade',
        x: 'x',
        data: {
            columns: [
                releaseDateCounts
            ],
            type: 'bar'
        },
        axis: {
            x: {
                type: 'category',
                categories: decades
            }
        },
        legend: {
            hide: true
        },
        color: {
            pattern: ['#D62828', '#F75C03', '#F77F00', '#FCBF49', '#EAE2B7']
        }
    });
    c3.generate({
        bindto: '.items-by-studio',
        data: {
            // set the columns property to a dictionary that contains the first 20 key/value pairs of the studios dictionary
            columns: sortedStudios,
            type : 'pie'
        },
        pie: {
            label: {
                format: function (value, ratio, id) {
                    return value;
                }
            }
        },
        color: {
            pattern: ['#D62828', '#F75C03', '#F77F00', '#FCBF49', '#EAE2B7']
        },
        legend: {
            hide: true
        },
        tooltip: {
            format: {
                value: function (value, ratio, id) {
                    return id + ' : ' + value;
                }
            }
        }
    });
}

////////////////
// Vue instance
const app = new Vue({
    el: '#app',
    data: {
        serverIp: serverIp,
        availableLibraries: availableLibraries,
        libraryStatsLoading: libraryStatsLoading,
        selectedLibrary: selectedLibrary,
        selectedLibraryStats: selectedLibraryStats,
        selectedLibrarySummary: selectedLibrarySummary
    },
    mounted: function () {
        axios.get(libraryListUrl).then((response) => {
            console.log('library list XML:', response.data);
            app.availableLibraries = parseLibraryList(response.data);
            console.log('Available libraries:', app.availableLibraries);
        })
    }
});