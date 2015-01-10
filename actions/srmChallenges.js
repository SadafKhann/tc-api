/*
 * Copyright (C) 2013-2014 TopCoder Inc., All Rights Reserved.
 *
 * @version 1.10
 * @author Sky_, freegod, panoptimum, Ghost_141, onsky
 * changes in 1.1:
 * - implement srm API
 * changes in 1.2:
 * - Use empty result set instead of 404 error in get srm challenges API.
 * changes in 1.3
 * - implement APIs for managing SRM contests for admin:
 *   - list SRM contests
 *   - create SRM contest
 *   - update SRM contest
 * changes in 1.4
 * - implement admin APIs for SRM round configuration:
 *   - set room assignment api
 *   - set round language api
 *   - set round events api
 *   - load round access api
 * changes in 1.5
 * - added API for retrieving SRM schedule
 * Changes in 1.6:
 * - Update search srm challenges api to use informixoltp database.
 * Changes in 1.7:
 * - Update search srm challenges api. Add challengeName filter.
 * Changes in 1.8:
 * - Implement get srm practice problems api.
 * Changes in 1.9:
 * - Implement Rounds For Problem API
 * Changes in 1.10:
 * - Update the get srm schedule API.
 */
/*jslint node: true, nomen: true */
"use strict";
var async = require('async');
var _ = require('underscore');
var moment = require('moment-timezone');
var IllegalArgumentError = require('../errors/IllegalArgumentError');
var NotFoundError = require('../errors/NotFoundError');
var ForbiddenError = require('../errors/ForbiddenError');

/**
 * Represents a predefined list of valid sort column for active challenge.
 */
var ALLOWABLE_SORT_COLUMN = [
    "roundId", "name", "startDate", "totalCompetitors", "divICompetitors", "divIICompetitors",
    "divITotalSolutionsSubmitted", "divIAverageSolutionsSubmitted", "divIITotalSolutionsSubmitted",
    "divIIAverageSolutionsSubmitted", "divITotalSolutionsChallenged",
    "divIAverageSolutionsChallenged", "divIITotalSolutionsChallenged", "divIIAverageSolutionsChallenged", "submissionEndDate"
];

/**
 * Represents a predefined list of valid sort column for querying the srm schedules.
 * @since 1.10
 */
var ALLOWABLE_SCHEDULE_SORT_COLUMN = [
    "registrationStartTime", "registrationEndTime",
    "codingStartTime", "codingEndTime",
    "intermissionStartTime", "intermissionEndTime",
    "challengeStartTime", "challengeEndTime",
    "systestStartTime", "systestEndTime"
];

/**
 * Valid status value for srm schedule api.
 * @since 1.10
 */
var VALID_ROUND_STATUS = ['f', 'a', 'p'];
/**
 * Valid status value for srm schedule api.
 * @since 1.10
 */
var VALID_ROUND_TYPES = ['Single Round Match', 'Tournament Round', 'Long Round'];

/**
 * The round types map.
 * @since 1.10
 */
var ROUND_TYPES = {
    "single round match": 1,
    "tournament round": 2,
    "long round": 10
};

/**
 * The schedule date format.
 * @since 1.10
 */
var SCHEDULE_DATE_FORMAT = 'YYYY-MM-DDTHH:mm:ss.SSSZ';

/**
 * The schedule date format for database.
 * @since 1.10
 */
var SCHEDULE_DATE_FORMAT_DB = 'YYYY-MM-DD HH:mm:ss';

/**
 * The backend server timezone.
 * @since 1.10
 */
var SCHEDULE_TIMEZONE = '';

/**
 * Contest Constants
 */
var CONTEST_CONSTANTS = {
    RANDOM_SEEDING: 1,
    IRON_MAN_SEEDING: 2,
    NCAA_STYLE: 3,
    EMPTY_ROOM_SEEDING: 4,
    WEEKEST_LINK_SEEDING: 5,
    ULTRA_RANDOM_SEEDING: 6,
    TCO05_SEEDING: 7,
    DARTBOARD_SEEDING: 8,
    TCHS_SEEDING: 9,
    ULTRA_RANDOM_DIV2_SEEDING: 10,
    /** Represents a single round match round. */
    SRM_ROUND_TYPE_ID: 1,

    /** Represents a algorithm tournament round. */
    TOURNAMENT_ROUND_TYPE_ID: 2,

    /** Represents a algorithm practice round. */
    PRACTICE_ROUND_TYPE_ID: 3,

    /** Represents a lobby. */
    LOBBY_ROUND_TYPE_ID: 4,

    /** Represents a moderated lobby. */
    MODERATED_CHAT_ROUND_TYPE_ID: 5,

    /** Represents a single round match round with teams. */
    TEAM_SRM_ROUND_TYPE_ID: 7,

    /** Represents a tournament round with teams. */
    TEAM_TOURNAMENT_ROUND_TYPE_ID: 8,

    /** Represents a algorithm practice round with teams. */
    TEAM_PRACTICE_ROUND_TYPE_ID: 9,

    /** Represents a 24-hour algorithm round (for TCO qualifications). */
    LONG_ROUND_TYPE_ID: 10,

    /** Represents a special algorithm round. */
    WEAKEST_LINK_ROUND_TYPE_ID: 11,

    /** Represents a customer-labeled tournament round (e.g. Google Code Jam). */
    PRIVATE_LABEL_TOURNAMENT_ROUND_TYPE_ID: 12,

    /** Represents a marathon round. */
    LONG_PROBLEM_ROUND_TYPE_ID: 13,

    /** Represents a marathon practice round. */
    LONG_PROBLEM_PRACTICE_ROUND_TYPE_ID: 14,

    /** Represents a marathon round for Intel. */
    INTEL_LONG_PROBLEM_ROUND_TYPE_ID: 15,

    /** Represents a marathon practice round for Intel. */
    INTEL_LONG_PROBLEM_PRACTICE_ROUND_TYPE_ID: 16,

    /** Represents a highschool single round match round. */
    HS_SRM_ROUND_TYPE_ID: 17,

    /** Represents a highschool algorithm tournament round. */
    HS_TOURNAMENT_ROUND_TYPE_ID: 18,

    /** Represents a marathon tournament round. */
    LONG_PROBLEM_TOURNAMENT_ROUND_TYPE_ID: 19,

    /** Represents a college tour round. */
    INTRO_EVENT_ROUND_TYPE_ID: 20,

    /** Represents an education round. */
    EDUCATION_ALGO_ROUND_TYPE_ID: 21,

    /** Represents a marathon round for AMD. */
    AMD_LONG_PROBLEM_ROUND_TYPE_ID: 22,

    /** Represents a marathon practice round for AMD. */
    AMD_LONG_PROBLEM_PRACTICE_ROUND_TYPE_ID: 23,

    /** Represents a marathon round for CUDA. */
    CUDA_LONG_PROBLEM_ROUND_TYPE_ID: 25,

    /** Represents a marathon practice round for CUDA. */
    CUDA_LONG_PROBLEM_PRACTICE_ROUND_TYPE_ID: 26,

    /** Represents a marathon round for QA. */
    LONG_PROBLEM_QA_ROUND_TYPE_ID: 27,

    /** Represents a single round match qa round. */
    SRM_QA_ROUND_TYPE_ID: 28,

    /** Represents a forwarded algorithm round used for onsite matches. */
    FORWARDER_ROUND_TYPE_ID: -1,

    /** Represents a forwarded marathon round used for onsite matches. */
    FORWARDER_LONG_ROUND_TYPE_ID: -2
};

/**
 * Maximum possible value for id fields
 */
var MAX_ID = 999999999;

/**
 * The date format for input date parameter for input date parameter
 * startDate, endDate, adStart, adEnd
 */
var DATE_FORMAT = "YYYY-MM-DD HH:mm";
/**
 * Max value for integer
 */
var MAX_INT = 2147483647;

/**
 * The default page size
 */
var DEFAULT_PAGE_SIZE = 50;

/**
 * Default number of leaders to show in SRM details
 */
var LEADER_COUNT = 5;

/**
 * Forbidden error message for non-admin users
 */
var NON_ADMIN_MESSAGE = "Admin access only.",
    UNAUTHORIZED_MESSAGE = "Authorized access only.";
/**
* The API for searching SRM challenges
*/
exports.searchSRMChallenges = {
    name: "searchSRMChallenges",
    description: "searchSRMChallenges",
    inputs: {
        required: [],
        optional: ["pageSize", "pageIndex", "sortColumn", "sortOrder", "listType", "challengeName"]
    },
    blockedConnectionTypes: [],
    outputExample: {},
    version: 'v2',
    transaction: 'read', // this action is read-only
    databases: ["informixoltp"],
    run: function (api, connection, next) {
        api.log("Execute searchSRMChallenges#run", 'debug');
        var helper = api.helper, params = connection.params, sqlParams, listType,
            pageIndex, pageSize, sortColumn, sortOrder, error, result, status, challengeName,
            dbConnectionMap = connection.dbConnectionMap;
        if (!dbConnectionMap) {
            helper.handleNoConnection(api, connection, next);
            return;
        }

        sortOrder = (params.sortOrder || "asc").toLowerCase();
        sortColumn = (params.sortColumn || "roundId").toLowerCase();
        // for now
        if (sortColumn === 'submissionenddate') {
            sortColumn = "roundid";
        }
        pageIndex = Number(params.pageIndex || 1);
        pageSize = Number(params.pageSize || DEFAULT_PAGE_SIZE);
        listType = (params.listType || 'ACTIVE').toUpperCase();
        challengeName = '%' + params.challengeName.toLowerCase() + '%' || '%';

        if (!_.isDefined(params.sortOrder) && sortColumn === "roundid") {
            sortOrder = "desc";
        }

        if (listType === helper.ListType.ACTIVE) {
            status = 'A';
        } else {
            status = 'F';
        }

        async.waterfall([
            function (cb) {
                var allowedSort = helper.getLowerCaseList(ALLOWABLE_SORT_COLUMN);
                if (_.isDefined(params.pageIndex) && pageIndex !== -1) {
                    error = helper.checkDefined(params.pageSize, "pageSize");
                }
                error = error ||
                    helper.checkMaxNumber(pageIndex, MAX_INT, "pageIndex") ||
                    helper.checkMaxNumber(pageSize, MAX_INT, "pageSize") ||
                    helper.checkPageIndex(pageIndex, "pageIndex") ||
                    helper.checkPositiveInteger(pageSize, "pageSize") ||
                    helper.checkContains(["asc", "desc"], sortOrder, "sortOrder") ||
                    helper.checkContains([helper.ListType.ACTIVE, helper.ListType.UPCOMING], listType, 'listType') ||
                    _.checkArgument(challengeName.length <= 32, 'The challengeName should less than 32 characters.') ||
                    helper.checkContains(allowedSort, sortColumn, "sortColumn");
                if (error) {
                    cb(error);
                    return;
                }

                if (pageIndex === -1) {
                    pageIndex = 1;
                    pageSize = MAX_INT;
                }
                sqlParams = {
                    firstRowIndex: (pageIndex - 1) * pageSize,
                    pageSize: pageSize,
                    sortColumn: helper.getSortColumnDBName(sortColumn),
                    sortOrder: sortOrder,
                    challengeName: challengeName,
                    status: status
                };

                async.parallel({
                    count: function (cbx) {
                        api.dataAccess.executeQuery("get_srm_challenges_count",
                            sqlParams,
                            dbConnectionMap,
                            cbx);
                    },
                    data: function (cbx) {
                        api.dataAccess.executeQuery("get_srm_challenges",
                            sqlParams,
                            dbConnectionMap,
                            cbx);
                    }
                }, cb);
            }, function (results, cb) {
                if (results.data.length === 0) {
                    result = {
                        total: 0,
                        pageIndex: pageIndex,
                        pageSize: Number(params.pageIndex) === -1 ? 0 : pageSize,
                        data: []
                    };
                    cb();
                    return;
                }
                var total = results.count[0].total_count;
                result = {
                    total: total,
                    pageIndex: pageIndex,
                    pageSize: Number(params.pageIndex) === -1 ? total : pageSize,
                    data: []
                };
                results.data.forEach(function (item) {
                    var challenge = {
                        roundId: item.round_id,
                        name: item.name,
                        startDate: item.start_date,
                        submissionEndDate: item.end_date,
                        totalCompetitors: item.total_competitors,
                        divICompetitors: item.div_i_competitors,
                        divIICompetitors: item.div_ii_competitors,
                        divITotalSolutionsSubmitted: item.div_i_total_solutions_submitted,
                        divIAverageSolutionsSubmitted: item.div_i_average_solutions_submitted,
                        divIITotalSolutionsSubmitted: item.div_ii_total_solutions_submitted,
                        divIIAverageSolutionsSubmitted: item.div_ii_average_solutions_submitted,
                        divITotalSolutionsChallenged: item.div_i_total_solutions_challenged,
                        divIAverageSolutionsChallenged: item.div_i_average_solutions_challenged,
                        divIITotalSolutionsChallenged: item.div_ii_total_solutions_challenged,
                        divIIAverageSolutionsChallenged: item.div_ii_average_solutions_challenged
                    };

                    result.data.push(challenge);
                });
                cb();
            }
        ], function (err) {
            if (err) {
                helper.handleError(api, connection, err);
            } else {
                connection.response = result;
            }
            next(connection, true);
        });
    }
};

/**
 * The status filter for srm schedule api.
 * @since 1.10
 */
var SCHEDULE_STATUS_FILTER = " AND LOWER(r.status) IN (@filter@)\n";

/**
 * The round type filter for srm schedule api.
 * @since 1.10
 */
var SCHEDULE_ROUND_TYPE_FILTER = " AND r.round_type_id IN (@filter@)\n";

/**
 * The registration start time before filter for srm schedule api.
 * @since 1.10
 */
var REGISTRATION_START_TIME_BEFORE_FILTER = " AND extend(reg.start_time, year to second) <= '@filter@'\n";

/**
 * The registration start time after filter for srm schedule api.
 * @since 1.10
 */
var REGISTRATION_START_TIME_AFTER_FILTER = " AND extend(reg.start_time, year to second) >= '@filter@'\n";

/**
 * The registration end time before filter for srm schedule api.
 * @since 1.10
 */
var REGISTRATION_END_TIME_BEFORE_FILTER = " AND extend(reg.end_time, year to second) <= '@filter@'\n";

/**
 * The registration end time after filter for srm schedule api.
 * @since 1.10
 */
var REGISTRATION_END_TIME_AFTER_FILTER = " AND extend(reg.end_time, year to second) >= '@filter@'\n";

/**
 * The coding start time before filter for srm schedule api.
 * @since 1.10
 */
var CODING_START_TIME_BEFORE_FILTER = " AND extend(coding.start_time, year to second) <= '@filter@'\n";

/**
 * The coding start time after filter for srm schedule api.
 * @since 1.10
 */
var CODING_START_TIME_AFTER_FILTER = " AND extend(coding.start_time, year to second) >= '@filter@'\n";

/**
 * The coding end time before filter for srm schedule api.
 * @since 1.10
 */
var CODING_END_TIME_BEFORE_FILTER = " AND extend(coding.end_time, year to second) <= '@filter@'\n";

/**
 * The coding end time after filter for srm schedule api.
 * @since 1.10
 */
var CODING_END_TIME_AFTER_FILTER = " AND extend(coding.end_time, year to second) >= '@filter@'\n";

/**
 * The intermission start time before filter for srm schedule api.
 * @since 1.10
 */
var INTERMISSION_START_TIME_BEFORE_FILTER = " AND extend(intermission.start_time, year to second) <= '@filter@'\n";

/**
 * The intermission start time after filter for srm schedule api.
 * @since 1.10
 */
var INTERMISSION_START_TIME_AFTER_FILTER = " AND extend(intermission.start_time, year to second) >= '@filter@'\n";

/**
 * The intermission end time before filter for srm schedule api.
 * @since 1.10
 */
var INTERMISSION_END_TIME_BEFORE_FILTER = " AND extend(intermission.end_time, year to second) <= '@filter@'\n";

/**
 * The intermission end time after filter for srm schedule api.
 * @since 1.10
 */
var INTERMISSION_END_TIME_AFTER_FILTER = " AND extend(intermission.end_time, year to second) >= '@filter@'\n";

/**
 * The challenge start time before filter for srm schedule api.
 * @since 1.10
 */
var CHALLENGE_START_TIME_BEFORE_FILTER = " AND extend(challenge.start_time, year to second) <= '@filter@'\n";

/**
 * The challenge start time after filter for srm schedule api.
 * @since 1.10
 */
var CHALLENGE_START_TIME_AFTER_FILTER = " AND extend(challenge.start_time, year to second) >= '@filter@'\n";

/**
 * The challenge end time before filter for srm schedule api.
 * @since 1.10
 */
var CHALLENGE_END_TIME_BEFORE_FILTER = " AND extend(challenge.end_time, year to second) <= '@filter@'\n";

/**
 * The challenge end time after filter for srm schedule api.
 * @since 1.10
 */
var CHALLENGE_END_TIME_AFTER_FILTER = " AND extend(challenge.end_time, year to second) >= '@filter@'\n";

/**
 * The system test start time before filter for srm schedule api.
 * @since 1.10
 */
var SYSTEM_TEST_START_TIME_BEFORE_FILTER = " AND extend(systest.start_time, year to second) <= '@filter@'\n";

/**
 * The system test start time after filter for srm schedule api.
 * @since 1.10
 */
var SYSTEM_TEST_START_TIME_AFTER_FILTER = " AND extend(systest.start_time, year to second) >= '@filter@'\n";

/**
 * The system test end time before filter for srm schedule api.
 * @since 1.10
 */
var SYSTEM_TEST_END_TIME_BEFORE_FILTER = " AND extend(systest.end_time, year to second) <= '@filter@'\n";

/**
 * The system test end time after filter for srm schedule api.
 * @since 1.10
 */
var SYSTEM_TEST_END_TIME_AFTER_FILTER = " AND extend(systest.end_time, year to second) >= '@filter@'\n";

/**
 * Add filter for query based on given connection parameters.
 * This method will add additional filter into sql query based on input parameters of srm schedule api.
 *
 * @param {String} query - The sql query that will be executed.
 * @param {Object} parameters - The input parameters.
 * @param {Object} helper - The helper object.
 * @return {String} The query with additional filter.
 * @since 1.10
 */
function addScheduleFilter(query, parameters, helper) {

    if (!_.isUndefined(parameters.statuses)) {
        query = helper.editSql(query, SCHEDULE_STATUS_FILTER,
            parameters.statuses.split(',').map(function (s) { return "'" + s.toLowerCase().trim() + "'"; }).join(','));
    }

    if (!_.isUndefined(parameters.types)) {
        query = helper.editSql(query, SCHEDULE_ROUND_TYPE_FILTER,
            parameters.types.split(',').map(function (s) { return ROUND_TYPES[s.toLowerCase().trim()]; }).join(','));
    }

    if (!_.isUndefined(parameters.registrationStartTimeBefore)) {
        query = helper.editSql(query, REGISTRATION_START_TIME_BEFORE_FILTER, moment(parameters.registrationStartTimeBefore).zone(SCHEDULE_TIMEZONE).format(SCHEDULE_DATE_FORMAT_DB));
    }

    if (!_.isUndefined(parameters.registrationStartTimeAfter)) {
        query = helper.editSql(query, REGISTRATION_START_TIME_AFTER_FILTER, moment(parameters.registrationStartTimeAfter).zone(SCHEDULE_TIMEZONE).format(SCHEDULE_DATE_FORMAT_DB));
    }

    if (!_.isUndefined(parameters.registrationEndTimeBefore)) {
        query = helper.editSql(query, REGISTRATION_END_TIME_BEFORE_FILTER, moment(parameters.registrationEndTimeBefore).zone(SCHEDULE_TIMEZONE).format(SCHEDULE_DATE_FORMAT_DB));
    }

    if (!_.isUndefined(parameters.registrationEndTimeAfter)) {
        query = helper.editSql(query, REGISTRATION_END_TIME_AFTER_FILTER, moment(parameters.registrationEndTimeAfter).zone(SCHEDULE_TIMEZONE).format(SCHEDULE_DATE_FORMAT_DB));
    }

    if (!_.isUndefined(parameters.codingStartTimeBefore)) {
        query = helper.editSql(query, CODING_START_TIME_BEFORE_FILTER, moment(parameters.codingStartTimeBefore).zone(SCHEDULE_TIMEZONE).format(SCHEDULE_DATE_FORMAT_DB));
    }

    if (!_.isUndefined(parameters.codingStartTimeAfter)) {
        query = helper.editSql(query, CODING_START_TIME_AFTER_FILTER, moment(parameters.codingStartTimeAfter).zone(SCHEDULE_TIMEZONE).format(SCHEDULE_DATE_FORMAT_DB));
    }

    if (!_.isUndefined(parameters.codingEndTimeBefore)) {
        query = helper.editSql(query, CODING_END_TIME_BEFORE_FILTER, moment(parameters.codingEndTimeBefore).zone(SCHEDULE_TIMEZONE).format(SCHEDULE_DATE_FORMAT_DB));
    }

    if (!_.isUndefined(parameters.codingEndTimeAfter)) {
        query = helper.editSql(query, CODING_END_TIME_AFTER_FILTER, moment(parameters.codingEndTimeAfter).zone(SCHEDULE_TIMEZONE).format(SCHEDULE_DATE_FORMAT_DB));
    }

    if (!_.isUndefined(parameters.intermissionStartTimeBefore)) {
        query = helper.editSql(query, INTERMISSION_START_TIME_BEFORE_FILTER, moment(parameters.intermissionStartTimeBefore).zone(SCHEDULE_TIMEZONE).format(SCHEDULE_DATE_FORMAT_DB));
    }

    if (!_.isUndefined(parameters.intermissionStartTimeAfter)) {
        query = helper.editSql(query, INTERMISSION_START_TIME_AFTER_FILTER, moment(parameters.intermissionStartTimeAfter).zone(SCHEDULE_TIMEZONE).format(SCHEDULE_DATE_FORMAT_DB));
    }

    if (!_.isUndefined(parameters.intermissionEndTimeBefore)) {
        query = helper.editSql(query, INTERMISSION_END_TIME_BEFORE_FILTER, moment(parameters.intermissionEndTimeBefore).zone(SCHEDULE_TIMEZONE).format(SCHEDULE_DATE_FORMAT_DB));
    }

    if (!_.isUndefined(parameters.intermissionEndTimeAfter)) {
        query = helper.editSql(query, INTERMISSION_END_TIME_AFTER_FILTER, moment(parameters.intermissionEndTimeAfter).zone(SCHEDULE_TIMEZONE).format(SCHEDULE_DATE_FORMAT_DB));
    }

    if (!_.isUndefined(parameters.challengeStartTimeBefore)) {
        query = helper.editSql(query, CHALLENGE_START_TIME_BEFORE_FILTER, moment(parameters.challengeStartTimeBefore).zone(SCHEDULE_TIMEZONE).format(SCHEDULE_DATE_FORMAT_DB));
    }

    if (!_.isUndefined(parameters.challengeStartTimeAfter)) {
        query = helper.editSql(query, CHALLENGE_START_TIME_AFTER_FILTER, moment(parameters.challengeStartTimeAfter).zone(SCHEDULE_TIMEZONE).format(SCHEDULE_DATE_FORMAT_DB));
    }

    if (!_.isUndefined(parameters.challengeEndTimeBefore)) {
        query = helper.editSql(query, CHALLENGE_END_TIME_BEFORE_FILTER, moment(parameters.challengeEndTimeBefore).zone(SCHEDULE_TIMEZONE).format(SCHEDULE_DATE_FORMAT_DB));
    }

    if (!_.isUndefined(parameters.challengeEndTimeAfter)) {
        query = helper.editSql(query, CHALLENGE_END_TIME_AFTER_FILTER, moment(parameters.challengeEndTimeAfter).zone(SCHEDULE_TIMEZONE).format(SCHEDULE_DATE_FORMAT_DB));
    }

    if (!_.isUndefined(parameters.systestStartTimeBefore)) {
        query = helper.editSql(query, SYSTEM_TEST_START_TIME_BEFORE_FILTER, moment(parameters.systestStartTimeBefore).zone(SCHEDULE_TIMEZONE).format(SCHEDULE_DATE_FORMAT_DB));
    }

    if (!_.isUndefined(parameters.systestStartTimeAfter)) {
        query = helper.editSql(query, SYSTEM_TEST_START_TIME_AFTER_FILTER, moment(parameters.systestStartTimeAfter).zone(SCHEDULE_TIMEZONE).format(SCHEDULE_DATE_FORMAT_DB));
    }

    if (!_.isUndefined(parameters.systestEndTimeBefore)) {
        query = helper.editSql(query, SYSTEM_TEST_END_TIME_BEFORE_FILTER, moment(parameters.systestEndTimeBefore).zone(SCHEDULE_TIMEZONE).format(SCHEDULE_DATE_FORMAT_DB));
    }

    if (!_.isUndefined(parameters.systestEndTimeAfter)) {
        query = helper.editSql(query, SYSTEM_TEST_END_TIME_AFTER_FILTER, moment(parameters.systestEndTimeAfter).zone(SCHEDULE_TIMEZONE).format(SCHEDULE_DATE_FORMAT_DB));
    }

    return query;
}

/**
 * This method will check the specified phase time.
 *
 * @param {Object} error - the error object.
 * @param {String} phaseTimeBefore - the phase time start date.
 * @param {String} phaseTimeAfter - the phase time end date.
 * @param {String} timeBeforeStr - the start phase time name.
 * @param {String} timeEndStr - the end phase time name.
 * @param {Object} helper - the helper object used to validation.
 * @since 1.10
 */
function validatePhaseTime(error, phaseTimeBefore, timeBeforeStr, phaseTimeAfter, timeEndStr, helper) {
    if (!_.isUndefined(phaseTimeBefore)) {
        error = error || helper.validateDate(phaseTimeBefore, timeBeforeStr, SCHEDULE_DATE_FORMAT);
    }
    if (!_.isUndefined(phaseTimeAfter)) {
        error = error || helper.validateDate(phaseTimeAfter, timeEndStr, SCHEDULE_DATE_FORMAT);
    }
    if (!_.isUndefined(phaseTimeAfter) && !_.isUndefined(phaseTimeBefore)) {
        error = error || helper.checkDates(phaseTimeAfter, phaseTimeBefore,
            timeEndStr + " should be earlier than " + timeBeforeStr);
    }
    return error;
}

/**
 * This method will check the phase times.
 *
 * @param {Object} error - the error object..
 * @param {Object} params - the parameters.
 * @param {Object} helper - the helper object used to validation.
 * @since 1.10
 */
function checkPhaseTimes(error, params, helper) {
    error = validatePhaseTime(error, params.registrationStartTimeBefore, 'registrationStartTimeBefore',
        params.registrationStartTimeAfter, 'registrationStartTimeAfter', helper);
    error = validatePhaseTime(error, params.registrationEndTimeBefore, 'registrationEndTimeBefore',
        params.registrationEndTimeAfter, 'registrationEndTimeAfter', helper);
    error = validatePhaseTime(error, params.codingStartTimeBefore, 'codingStartTimeBefore',
        params.codingStartTimeAfter, 'codingStartTimeAfter', helper);
    error = validatePhaseTime(error, params.codingEndTimeBefore, 'codingEndTimeBefore',
        params.codingEndTimeAfter, 'codingEndTimeAfter', helper);
    error = validatePhaseTime(error, params.intermissionStartTimeBefore, 'intermissionStartTimeBefore',
        params.intermissionStartTimeAfter, 'intermissionStartTimeAfter', helper);
    error = validatePhaseTime(error, params.intermissionEndTimeBefore, 'intermissionEndTimeBefore',
        params.intermissionEndTimeAfter, 'intermissionEndTimeAfter', helper);
    error = validatePhaseTime(error, params.challengeStartTimeBefore, 'challengeStartTimeBefore',
        params.challengeStartTimeAfter, 'challengeStartTimeAfter', helper);
    error = validatePhaseTime(error, params.challengeEndTimeBefore, 'challengeEndTimeBefore',
        params.challengeEndTimeAfter, 'challengeEndTimeAfter', helper);
    error = validatePhaseTime(error, params.systestStartTimeBefore, 'systestStartTimeBefore',
        params.systestStartTimeAfter, 'systestStartTimeAfter', helper);
    error = validatePhaseTime(error, params.systestEndTimeBefore, 'systestEndTimeBefore',
        params.systestEndTimeAfter, 'systestEndTimeAfter', helper);

    return error;
}

/**
 * The API for getting SRM schedule.
 * Changes in 1.10; the API is now returning all phases schedule with the round information.
 * It supports sorting by times.
 * It supports filtering by Type, Status, and all times for phases. The default filtering will be Status = 'F', but it can be support filtering by multiple status, like status=F,A,P.
 */
exports.getSRMSchedule = {
    name: "getSRMSchedule",
    description: "getSRMSchedule",
    inputs: {
        required: [],
        optional: ["pageSize", "pageIndex", "sortColumn", "sortOrder", "statuses", "types",
            "registrationStartTimeBefore", "registrationEndTimeBefore",
            "codingStartTimeBefore", "codingEndTimeBefore",
            "intermissionStartTimeBefore", "intermissionEndTimeBefore",
            "challengeStartTimeBefore", "challengeEndTimeBefore",
            "systestStartTimeBefore", "systestEndTimeBefore",
            "registrationStartTimeAfter", "registrationEndTimeAfter",
            "codingStartTimeAfter", "codingEndTimeAfter",
            "intermissionStartTimeAfter", "intermissionEndTimeAfter",
            "challengeStartTimeAfter", "challengeEndTimeAfter",
            "systestStartTimeAfter", "systestEndTimeAfter"]
    },
    blockedConnectionTypes: [],
    outputExample: {},
    version: 'v2',
    transaction: 'read', // this action is read-only
    databases: ["informixoltp"],
    run: function (api, connection, next) {
        api.log("Execute getSRMSchedule#run", 'debug');
        var helper = api.helper, params = connection.params, sqlParams,
            pageIndex, pageSize, sortColumn, sortOrder, error, response,
            dbConnectionMap = connection.dbConnectionMap,
            exeQuery = function (query) {
                return function (cbx) {
                    api.dataAccess.executeSqlQuery(query, sqlParams, 'informixoltp', connection.dbConnectionMap, cbx);
                };
            };
        if (!dbConnectionMap) {
            helper.handleNoConnection(api, connection, next);
            return;
        }

        sortOrder = (params.sortOrder || "asc").toLowerCase();
        sortColumn = (params.sortColumn || "registrationStartTime").toLowerCase();

        pageIndex = Number(params.pageIndex || 1);
        pageSize = Number(params.pageSize || DEFAULT_PAGE_SIZE);

        if (!_.isDefined(params.sortOrder) && sortColumn === "registrationstarttime") {
            sortOrder = "desc";
        }

        async.waterfall([
            function (cb) {
                var allowedSort = helper.getLowerCaseList(ALLOWABLE_SCHEDULE_SORT_COLUMN);
                if (_.isDefined(params.pageIndex) && pageIndex !== -1) {
                    error = helper.checkDefined(params.pageSize, "pageSize");
                }
                error = error ||
                    helper.checkMaxNumber(pageIndex, MAX_INT, "pageIndex") ||
                    helper.checkMaxNumber(pageSize, MAX_INT, "pageSize") ||
                    helper.checkPageIndex(pageIndex, "pageIndex") ||
                    helper.checkPositiveInteger(pageSize, "pageSize") ||
                    helper.checkContains(["asc", "desc"], sortOrder, "sortOrder") ||
                    helper.checkContains(allowedSort, sortColumn, "sortColumn");
                // validate the round status
                if (!_.isUndefined(connection.params.statuses)) {
                    error = error || helper.checkSubset(connection.params.statuses.split(','),
                        VALID_ROUND_STATUS, 'statuses');
                } else {
                    connection.params.statuses = 'f';
                }
                // validate the round types
                if (!_.isUndefined(connection.params.types)) {
                    error = error || helper.checkSubset(connection.params.types.split(','),
                        VALID_ROUND_TYPES, 'types');
                }

                // check the phases time if presented
                error = checkPhaseTimes(error, connection.params, helper);

                if (pageIndex === -1) {
                    pageIndex = 1;
                    pageSize = MAX_INT;
                }
                SCHEDULE_TIMEZONE = api.config.tcConfig.databaseTimezoneIdentifier;
                cb(error);
            },
            function (cb) {
                async.parallel({
                    data: function (cbx) {
                        helper.readQuery('get_srm_schedule', cbx);
                    },
                    count: function (cbx) {
                        helper.readQuery('get_srm_schedule_count', cbx);
                    }
                }, cb);
            },
            function (q, cb) {
                sqlParams = {
                    firstRowIndex: (pageIndex - 1) * pageSize,
                    pageSize: pageSize,
                    sortColumn: helper.getSortColumnDBName(sortColumn),
                    sortOrder: sortOrder
                };

                q.data = addScheduleFilter(q.data, connection.params, helper);
                q.count = addScheduleFilter(q.count, connection.params, helper);

                async.parallel({
                    data: exeQuery(q.data),
                    count: exeQuery(q.count)
                }, cb);
            },
            function (results, cb) {
                if (results.data.length === 0) {
                    response = {
                        total: 0,
                        pageIndex: pageIndex,
                        pageSize: Number(params.pageIndex) === -1 ? 0 : pageSize,
                        data: []
                    };
                    cb();
                    return;
                }
                var total = results.count[0].total_count;
                response = {
                    total: total,
                    pageIndex: pageIndex,
                    pageSize: Number(params.pageIndex) === -1 ? total : pageSize,
                    data: []
                };
                results.data.forEach(function (item) {
                    var challenge = {
                        roundId: item.round_id,
                        name: item.name,
                        shortName: item.short_name !== undefined ? item.short_name : 'N/A',
                        contestName: item.contest_name,
                        roundType: item.round_type,
                        status: item.status,
                        registrationStartTime: item.registration_start_time,
                        registrationEndTime: item.registration_end_time,
                        codingStartTime: item.coding_start_time,
                        codingEndTime: item.coding_end_time,
                        intermissionStartTime: item.intermission_start_time,
                        intermissionEndTime: item.intermission_end_time,
                        challengeStartTime: item.challenge_start_time,
                        challengeEndTime: item.challenge_end_time,
                        systestStartTime: item.systest_start_time,
                        systestEndTime: item.systest_end_time
                    };

                    response.data.push(challenge);
                });
                cb();
            }
        ], function (err) {
            if (err) {
                helper.handleError(api, connection, err);
            } else {
                connection.response = response;
            }
            next(connection, true);
        });
    }
};

/**
* The API for getting SRM challenge
*/
exports.getSRMChallenge = {
    name: "getSRMChallenge",
    description: "getSRMChallenge",
    inputs: {
        required: ["id"],
        optional: ["er"]
    },
    blockedConnectionTypes: [],
    outputExample: {},
    version: 'v2',
    transaction: 'read', // this action is read-only
    databases: ["topcoder_dw"],
    run: function (api, connection, next) {
        api.log("Execute getSRMChallenge#run", 'debug');
        var dbConnectionMap = connection.dbConnectionMap,
            id = Number(connection.params.id),
            er = Number(connection.params.er || LEADER_COUNT),
            helper = api.helper,
            sqlParams = {
                roundId: id,
                er: er
            },
            result;
        if (!connection.dbConnectionMap) {
            helper.handleNoConnection(api, connection, next);
            return;
        }
        async.waterfall([
            function (cb) {
                var error = helper.checkPositiveInteger(id, "id") ||
                    helper.checkMaxNumber(id, MAX_INT, "id") ||
                    helper.checkPositiveInteger(er, "er") ||
                    helper.checkMaxNumber(er, MAX_INT, "er");
                cb(error);
            },
            function (cb) {
                var execQuery = function (name, cbx) {
                    api.dataAccess.executeQuery(name,
                        sqlParams,
                        dbConnectionMap,
                        cbx);
                };
                async.parallel({
                    basic: function (cbx) {
                        execQuery("get_srm_detail_basic", cbx);
                    },
                    leaders: function (cbx) {
                        execQuery("get_srm_detail_leader", cbx);
                    },
                    problems: function (cbx) {
                        execQuery("get_srm_detail_problem", cbx);
                    }
                }, cb);
            }, function (results, cb) {
                if (results.basic.length === 0) {
                    cb(new NotFoundError("SRM challenge not found"));
                    return;
                }
                var groupedLeaders = _.groupBy(results.leaders, "division"),
                    groupedProblems = _.groupBy(results.problems, "division"),
                    mapLeader = function (a) {
                        delete a.division;
                        return a;
                    },
                    mapProblem = function (a) {
                        return {
                            "level": a.level,
                            "problemName": a.problem_name,
                            "submissions": a.submissions,
                            "correct%": a.correct_percent * 100,
                            "averagePoints": a.average_points
                        };
                    };
                result = {
                    roundId: id,
                    name: results.basic[0].name,
                    leaders: {
                        divisionI: _.map(groupedLeaders["Division-I"], mapLeader),
                        divisionII: _.map(groupedLeaders["Division-II"], mapLeader)
                    },
                    problems: {
                        divisionI: _.map(groupedProblems["Division-I"], mapProblem),
                        divisionII: _.map(groupedProblems["Division-II"], mapProblem)
                    }
                };

                cb();
            }
        ], function (err) {
            if (err) {
                helper.handleError(api, connection, err);
            } else {
                connection.response = result;
            }
            next(connection, true);
        });
    }
};

/**
 * The API to list SRM Contests
 */
exports.listSRMContests = {
    name: "listSRMContests",
    description: "List SRM Contests",
    inputs: {
        required: [],
        optional: []
    },
    blockedConnectionTypes: [],
    outputExample: {},
    version: 'v2',
    transaction: 'read', // this action is read-only
    databases: ["informixoltp"],
    run: function (api, connection, next) {
        api.log("Execute listSRMContests#run", 'debug');
        var formatDate = function (date) {
            var result = null;
            if (_.isString(date)) {
                result =  moment(date).format(DATE_FORMAT);
            }
            return result;
        };
        async.series(
            [
                function (cb) {
                    cb(api.helper.checkAdmin(connection, UNAUTHORIZED_MESSAGE, NON_ADMIN_MESSAGE));
                },
                _.bind(
                    api.dataAccess.executeQuery,
                    api.dataAccess,
                    "get_all_srm_contests",
                    {},
                    connection.dbConnectionMap
                )
            ],
            function (error, results) {
                if (error) {
                    api.helper.handleError(api, connection, error);
                } else {
                    if (results[1] && results[1].length > 0) {
                        connection.response = _.map(
                            results[1],
                            function (contest) {
                                return _.reduce(
                                    {
                                        contestId: (_.isNull(contest.contest_id) || _.isUndefined(contest.contest_id))
                                               ? null : contest.contest_id,
                                        name: contest.contest_name || null,
                                        startDate: formatDate(contest.start_date),
                                        endDate: formatDate(contest.end_date),
                                        status: contest.status || null,
                                        groupId: (_.isNull(contest.group_id) || _.isUndefined(contest.group_id))
                                            ? null : contest.group_id,
                                        adText: contest.ad_text || null,
                                        adStart: formatDate(contest.ad_start),
                                        adEnd: formatDate(contest.ad_end),
                                        adTask: contest.ad_task || null,
                                        adCommand: contest.ad_command || null,
                                        activateMenu: (_.isNull(contest.activate_menu)  ||
                                                       _.isUndefined(contest.activate_menu))
                                                    ? null : contest.activate_menu,
                                        season: (_.isNull(contest.season_id)  || _.isUndefined(contest.season_id))
                                              ? null : {seasonId: contest.season_id, name: contest.season_name}
                                    },
                                    function (memo, value, key) {
                                        if (!_.isNull(value)) {memo[key] = value; }
                                        return memo;
                                    },
                                    {}
                                );
                            }
                        );
                    } else {
                        connection.response = [];
                    }
                }
                next(connection, true);
            }
        );
    }
};

/**
 * This function checks if the numeric length property of an object exceeds
 * a given threshold.
 * @param obj - the object to be tested
 * @param length - an integer representing the threshold to be applied
 * @param name - a string representing the object name
 * @return IllegalArgumentError if the threshold is exceeded, null otherwise
 */
function checkExceedsLength(obj, length, name) {
    return obj.length > length ? new IllegalArgumentError(
        "Length of " + name + " must not exceed " + length + " characters."
    ) : null;
}

/**
 * This function checks if a string contains unescaped double quotes
 * @param obj - the string to be checked
 * @param name - the name of the string object
 * @return IllegalArgumentError if the string contains unescaped double quotes, null otherwise
 */
function checkIllegalCharacters(obj, name) {
    var pre = null,
        i,
        message = name + " contains unescaped quotes.";
    if (obj === '"') {
        return new IllegalArgumentError(message);
    }
    for (i = 0; i < obj.length; i += 1) {
        if (pre === '"') {
            if (obj.charAt(i) === '"') { // double quote is escaped by another double quote
                pre = null;
            } else { // double quote isn't followed by another double quote
                return new IllegalArgumentError(message);
            }
        } else if (obj.charAt(i) === '"') {
            pre = '"';
        }
    }
    if (pre === '"') { // last character is unescaped quote
        return new IllegalArgumentError(message);
    }
    return null;
}

/**
 * This function validates and prepares the Arguments to createSRMContest and updateSRMContest
 *
 * @param {Array} args - list of the parameters to be validated
 * @param {Object} api - the api object
 * @param {Object} connection - the connection object
 */
function validateAndPrepareSRMContestApiArguments(args, api, connection) {
    var helper = api.helper,
        params = connection.params,
        validators = {
            id: function (cb) {
                var id = parseInt(params.id, 10),
                    error = helper.checkIdParameter(id, "id");
                if (error) {
                    cb(error);
                } else {
                    async.parallel(
                        {
                            contestExists: _.bind(
                                api.dataAccess.executeQuery,
                                api.dataAccess,
                                "get_srm_contest",
                                {contestId: id},
                                connection.dbConnectionMap
                            )
                        },
                        function (error, results) {
                            if (error) {
                                cb(error);
                            } else {
                                if (results.contestExists.length === 0) {
                                    cb(new IllegalArgumentError("id is unknown."));
                                } else {
                                    cb(null, id);
                                }
                            }
                        }
                    );
                }
            },
            contestId: function (cb) {
                var contestId = parseInt(params.contestId, 10),
                    error = helper.checkIdParameter(contestId, "contestId");
                if (error) {
                    cb(error);
                } else {
                    cb(null, contestId);
                }
            },
            name: function (cb) {
                var name = params.name,
                    error = helper.checkStringPopulated(name, "name")
                         || checkExceedsLength(name, 50, "name")
                         || checkIllegalCharacters(name, "name");
                if (error) {
                    cb(error);
                } else {
                    cb(null, name);
                }
            },
            startDate: function (cb) {
                var startDate = params.startDate, error;
                if (_.isNull(startDate) || _.isUndefined(startDate)) {
                    cb(null, null);  // startDate is nullable
                } else {
                    error = helper.validateDate(startDate, 'startDate', DATE_FORMAT);
                    if (error) {
                        cb(error);
                    } else {
                        cb(null, startDate);
                    }
                }
            },
            endDate: [
                'startDate',
                function (cb, results) {
                    var endDate = params.endDate,
                        startDate = results.startDate,
                        error;
                    if (_.isNull(endDate) || _.isUndefined(endDate)) {
                        cb(null, null); // endDate is nullable
                    } else {
                        error = helper.validateDate(endDate, 'endDate', DATE_FORMAT);
                        if (error) {
                            cb(error);
                        } else {
                            if (startDate && !moment(startDate).isBefore(endDate)) {
                                cb(new IllegalArgumentError("startDate does not precede endDate."));
                            } else {
                                cb(null, endDate);
                            }
                        }
                    }
                }
            ],
            status: function (cb) {
                var status = params.status, error;
                if (_.isNull(status) || _.isUndefined(status)) {
                    cb(null, null); // status is nullable
                } else {
                    error = helper.checkStringPopulated(status, "status")
                         || (status.length !== 1 ? new IllegalArgumentError("status must be of length 1") : null)
                         || (/^[AFPI]$/.test(status) ? null : new IllegalArgumentError("status unknown."));
                    if (error) {
                        cb(error);
                    } else {
                        cb(null, status);
                    }
                }
            },
            groupId: function (cb) {
                var groupId, error;
                if (_.isNull(params.groupId) || _.isUndefined(params.groupId)) {
                    cb(null, null); // groupId is nullable
                } else {
                    groupId = parseInt(params.groupId, 10);
                    error = helper.checkInteger(groupId, "groupId");
                    if (error) {
                        cb(error);
                    } else {
                        async.series(
                            [
                                _.bind(
                                    api.dataAccess.executeQuery,
                                    api.dataAccess,
                                    "get_group",
                                    {groupId: groupId},
                                    connection.dbConnectionMap
                                )
                            ],
                            function (error, results) {
                                if (error) {
                                    cb(error);
                                } else {
                                    if (results[0].length > 0) {
                                        cb(null, groupId);
                                    } else {
                                        cb(new IllegalArgumentError("groupId is unknown."));
                                    }
                                }
                            }
                        );
                    }
                }
            },
            adText: function (cb) {
                var adText = params.adText, error;
                if (_.isNull(adText) || _.isUndefined(adText)) {
                    cb(null, null); // adText is nullable
                } else {
                    error = helper.checkString(adText, "adText")
                         || checkExceedsLength(adText, 250, "adText")
                         || checkIllegalCharacters(adText, "adText");
                    if (error) {
                        cb(error);
                    } else {
                        cb(null, adText);
                    }
                }
            },
            adStart: function (cb) {
                var adStart = params.adStart, error;
                if (_.isNull(adStart) || _.isUndefined(adStart)) {
                    cb(null, null); // adStart is nullable
                } else {
                    error = helper.validateDate(adStart, 'adStart', DATE_FORMAT);
                    if (error) {
                        cb(error);
                    } else {
                        cb(null, adStart);
                    }
                }
            },
            adEnd: [
                'adStart',
                function (cb, results) {
                    var adEnd = params.adEnd,
                        adStart = results.adStart,
                        error;
                    if (_.isNull(adEnd) || _.isUndefined(adEnd)) {
                        cb(null, null); // adEnd is nullable
                    } else {
                        error = helper.validateDate(adEnd, 'adEnd', DATE_FORMAT);
                        if (error) {
                            cb(error);
                        } else {
                            if (adStart && !moment(adStart).isBefore(adEnd)) {
                                cb(new IllegalArgumentError("adStart does not precede adEnd."));
                            } else {
                                cb(null, adEnd);
                            }
                        }
                    }
                }
            ],
            adTask: function (cb) {
                var adTask = params.adTask, error;
                if (_.isNull(adTask) || _.isUndefined(adTask)) {
                    cb(null, null); // adTask is nullable
                } else {
                    error = helper.checkString(adTask, "adTask")
                         || checkExceedsLength(adTask, 30, "adTask")
                         || checkIllegalCharacters(adTask, "adTask");
                    if (error) {
                        cb(error);
                    } else {
                        cb(null, adTask);
                    }
                }
            },
            adCommand: function (cb) {
                var adCommand = params.adCommand, error;
                if (_.isNull(adCommand) || _.isUndefined(adCommand)) {
                    cb(null, null); // adCommand is nullable
                } else {
                    error = helper.checkString(adCommand, "adCommand")
                         || checkExceedsLength(adCommand, 30, "adCommand")
                         || checkIllegalCharacters(adCommand, "adCommand");
                    if (error) {
                        cb(error);
                    } else {
                        cb(null, adCommand);
                    }
                }
            },
            activateMenu: function (cb) {
                var activateMenu, error;
                if (_.isNull(params.activateMenu) || _.isUndefined(params.activateMenu)) {
                    cb(null, null); // activateMenu is nullable
                } else {
                    activateMenu = parseInt(params.activateMenu, 10);
                    error = helper.checkInteger(activateMenu, "activateMenu");
                    if (error) {
                        cb(error);
                    } else {
                        cb(null, activateMenu);
                    }
                }
            },
            seasonId: function (cb) {
                var seasonId, error;
                if (_.isNull(params.seasonId) || _.isUndefined(params.seasonId)) {
                    cb(null, null); // seasonId is nullable
                } else {
                    seasonId = parseInt(params.seasonId, 10);
                    error = helper.checkIdParameter(seasonId, "seasonId");
                    if (error) {
                        cb(error);
                    } else {
                        async.series(
                            [
                                _.bind(
                                    api.dataAccess.executeQuery,
                                    api.dataAccess,
                                    "get_season",
                                    {seasonId: seasonId},
                                    connection.dbConnectionMap
                                )
                            ],
                            function (error, results) {
                                if (error) {
                                    cb(error);
                                } else {
                                    if (results[0].length === 0) {
                                        cb(new IllegalArgumentError("seasonId is unknown."));
                                    } else {
                                        cb(null, seasonId);
                                    }
                                }
                            }
                        );
                    }
                }
            }
        },
        validations = _.reduce(
            args,
            function (memo, validator) {
                memo[validator] = validators[validator];
                return memo;
            },
            {}
        );
    validations.sqlParams = _.flatten(
        [
            args,
            function (cb, results) {
                var escape = {
                    name: true,
                    status: true,
                    adText: true,
                    adTask: true,
                    adCommand: true,
                    startDate: true,
                    endDate: true,
                    adStart: true,
                    adEnd: true
                },
                    date = {
                        startDate: true,
                        endDate: true,
                        adStart: true,
                        adEnd: true
                    };
                cb(null, _.reduce(
                    args,
                    function (memo, item) {
                        if (_.isNull(results[item]) || _.isUndefined(results[item])) {
                            memo[item] = "NULL";
                        } else {
                            if (escape[item]) {
                                // normalize seconds in dates
                                memo[item] = '"' + results[item] + (date[item] ? ":00" : "")  + '"';
                            } else {
                                memo[item] = results[item];
                            }
                        }
                        return memo;
                    },
                    {}
                ));
            }
        ]
    );

    return function (done) {
        async.auto(validations, done);
    };
}

/**
 * The API to create a SRM Contest
 */
exports.createSRMContest = {
    name: "createSRMContest",
    description: "Create a SRM Contest",
    inputs: {
        required: ['name'],
        optional: [
            'startDate',
            'endDate',
            'status',
            'groupId',
            'adText',
            'adStart',
            'adEnd',
            'adTask',
            'adCommand',
            'activateMenu',
            'seasonId'
        ]
    },
    blockedConnectionTypes: [],
    outputExample: {},
    version: 'v2',
    transaction: 'write',
    databases: ["informixoltp"],
    run: function (api, connection, next) {
        api.log("Execute createSRMContest#run", 'debug');
        var helper = api.helper,
            genContestId = MAX_INT,
            dbConnectionMap = connection.dbConnectionMap;
        async.auto(
            {
                admin: function (cb) {
                    cb(helper.checkAdmin(connection, UNAUTHORIZED_MESSAGE, NON_ADMIN_MESSAGE));
                },
                common: [ // do common validations
                    'admin',
                    validateAndPrepareSRMContestApiArguments(
                        [
                            'name',
                            'startDate',
                            'endDate',
                            'status',
                            'groupId',
                            'adText',
                            'adStart',
                            'adEnd',
                            'adTask',
                            'adCommand',
                            'activateMenu',
                            'seasonId'
                        ],
                        api,
                        connection
                    )
                ],
                generateContestId : [ // generate the contestId from CONTEST_SEQ
                    'common',
                    function (cb, results) {
                        var validate = results.common;
                        async.waterfall([
                            function (cbx) {
                                api.idGenerator.getNextIDFromDb("CONTEST_SEQ", "informixoltp", dbConnectionMap, cbx);
                            },
                            function (contestId, cbx) {
                                genContestId = contestId;
                                validate.sqlParams.contestId = contestId;
                                cbx();
                            }
                        ], cb);
                    }
                ],
                insert: [
                    'generateContestId',
                    function (cb, results) {
                        console.log(JSON.stringify(results));
                        api.dataAccess.executeQuery(
                            "insert_srm_contest",
                            results.common.sqlParams,
                            dbConnectionMap,
                            cb
                        );
                    }
                ]
            },
            function (error) {
                if (error) {
                    api.helper.handleError(api, connection, error);
                } else {
                    connection.response = {contestId: genContestId};
                }
                next(connection, true);
            }
        );
    }
};

/**
 * The API to update a SRM Contest
 */
exports.updateSRMContest = {
    name: "updateSRMContest",
    description: "Update a SRM Contest",
    inputs: {
        required: ['id',
                   'contestId',
                   'name'
                  ],
        optional: ['startDate',
                   'endDate',
                   'status',
                   'groupId',
                   'adText',
                   'adStart',
                   'adEnd',
                   'adEnd',
                   'adEnd',
                   'adTask',
                   'adCommand',
                   'activateMenu',
                   'seasonId'
                  ]
    },
    blockedConnectionTypes: [],
    outputExample: {},
    version: 'v2',
    transaction: 'write',
    databases: ["informixoltp"],
    run: function (api, connection, next) {
        api.log("Execute updateSRMContest#run", 'debug');
        var helper = api.helper,
            dbConnectionMap = connection.dbConnectionMap;
        async.auto(
            {
                admin: function (cb) {
                    cb(helper.checkAdmin(connection, UNAUTHORIZED_MESSAGE, NON_ADMIN_MESSAGE));
                },
                validate: [
                    'admin',
                    validateAndPrepareSRMContestApiArguments(
                        [
                            'id',
                            'contestId',
                            'name',
                            'startDate',
                            'endDate',
                            'status',
                            'groupId',
                            'adText',
                            'adStart',
                            'adEnd',
                            'adEnd',
                            'adEnd',
                            'adTask',
                            'adCommand',
                            'activateMenu',
                            'seasonId'
                        ],
                        api,
                        connection
                    )
                ],
                updateContestId: [
                    'validate',
                    function (cb, results) {
                        var id = results.validate.id,
                            contestId = results.validate.contestId;
                        if (id !== contestId) {
                            async.series(
                                [
                                    _.bind(
                                        api.dataAccess.executeQuery,
                                        api.dataAccess,
                                        "insert_srm_contest",
                                        results.validate.sqlParams,
                                        dbConnectionMap
                                    ),
                                    _.bind(
                                        api.dataAccess.executeQuery,
                                        api.dataAccess,
                                        "update_srm_contest",
                                        results.validate.sqlParams,
                                        dbConnectionMap
                                    ),
                                    _.bind(
                                        api.dataAccess.executeQuery,
                                        api.dataAccess,
                                        "update_srm_contest_id",
                                        {contestId: contestId, id: id},
                                        dbConnectionMap
                                    ),
                                    _.bind(
                                        api.dataAccess.executeQuery,
                                        api.dataAccess,
                                        "delete_srm_contest",
                                        {id: id},
                                        dbConnectionMap
                                    )
                                ],
                                cb
                            );
                        } else {
                            cb();
                        }
                    }
                ],
                updateContest: [
                    'updateContestId',
                    function (cb, results) {
                        // don't update the same contest twice with the same data
                        // as done in AdminServicesBean#modifyContest(int, ContestData)
                        if (!results.updateContestId) {
                            api.dataAccess.executeQuery(
                                "update_srm_contest",
                                results.validate.sqlParams,
                                dbConnectionMap,
                                cb
                            );
                        } else {
                            cb();
                        }
                    }
                ]
            },
            function (error) {
                if (error) {
                    api.helper.handleError(api, connection, error);
                } else {
                    connection.response = {success: true};
                }
                next(connection, true);
            }
        );
    }
};

/**
 * Returns an asynchronous function that creates a sqlParams map
 * @param {Array} params - list of parameter names
 * @param {Object} escape - map of the form parameterName -> Boolean to indicate
 *                          which parameters are strings that need to be put into quotes
 * @param {Object} date - map of the form parameterName -> Boolean to indicate which parameters
 *                        are strings
 * @return {Function} - the function that creates the sqlParams
 */
function sqlParams(params, escape, date) {
    return function (cb, results) {
        cb(null, _.reduce(
            params,
            function (memo, item) {
                if (_.isNull(results[item]) || _.isUndefined(results[item])) {
                    memo[item] = "NULL";
                } else {
                    if (escape[item]) {
                        // normalize seconds in dates
                        memo[item] = '"' + results[item] + (date[item] ? ":00" : "")  + '"';
                    } else {
                        memo[item] = results[item];
                    }
                }
                return memo;
            },
            {}
        ));
    };
}

/**
 * The API to set a round room assignment
 */
exports.setRoundRoomAssignment = {
    name: "setRoundRoomAssignment",
    description: "Set a round room assignment",
    inputs: {
        required: ['roundId'
                  ],
        optional: [
            'codersPerRoom',
            'type',
            'isByDivision',
            'isByRegion',
            'isFinal',
            'p'
        ]
    },
    blockedConnectionTypes: [],
    outputExample: {},
    version: 'v2',
    transaction: 'write',
    databases: ["informixoltp"],
    run: function (api, connection, next) {
        api.log("Execute setRoundRoomAssignment#run", 'debug');
        var helper = api.helper,
            params = connection.params,
            dbConnectionMap = connection.dbConnectionMap,
            sqlparams = [
                'roundId',
                'codersPerRoom',
                'type',
                'isByDivision',
                'isByRegion',
                'isFinal',
                'p'
            ],
        /**
         * Return an asynchronous function that checks if a object corresponds
         * to an integer with value 0 or 1
         *
         * @param {Object} obj - the object to be checked
         * @param {String} name - the name of the object
         *
         * @return {Function} - the checker
         */
            checkFlag = function (obj, name) {
                return function (cb) {
                    var flag = parseInt(obj, 10),
                        error = helper.checkContains([0, 1], flag, name);
                    cb(error, flag);
                };
            };
        async.auto(
            {
                admin: function (cb) {
                    cb(helper.checkAdmin(connection, UNAUTHORIZED_MESSAGE, NON_ADMIN_MESSAGE));
                },
                roundId: [
                    'admin',
                    function (cb) {
                        var roundId = parseInt(params.roundId, 10),
                            error = helper.checkIdParameter(roundId, "roundId")
                                 || helper.checkMaxNumber(roundId, MAX_ID, "roundId");
                        cb(error, roundId);
                    }
                ],
                exists: [
                    'roundId',
                    function (cb, results) {
                        async.series(
                            [
                                _.bind(
                                    api.dataAccess.executeQuery,
                                    api.dataAccess,
                                    "check_round_room_assignment_exist",
                                    {roundId: results.roundId},
                                    dbConnectionMap
                                )
                            ],
                            function (error, results) {
                                if (error) {
                                    cb(error);
                                } else {
                                    if (results[0][0].round_room_assignment_exist === 0) {
                                        cb(new IllegalArgumentError("roundId does not have a round room assignment."));
                                    } else {
                                        cb(null, null);
                                    }
                                }
                            }
                        );
                    }
                ],
                codersPerRoom: [
                    'admin',
                    function (cb) {
                        var codersPerRoom = parseInt(params.codersPerRoom, 10),
                            error = helper.checkPositiveInteger(codersPerRoom, "codersPerRoom")
                                    || helper.checkMaxNumber(codersPerRoom, 9999, "codersPerRoom");
                        cb(error, codersPerRoom);
                    }
                ],
                type: [
                    'admin',
                    function (cb) {
                        var seedings = _.values(
                                _.pick(
                                    CONTEST_CONSTANTS,
                                    "RANDOM_SEEDING",
                                    "IRON_MAN_SEEDING",
                                    "NCAA_STYLE",
                                    "EMPTY_ROOM_SEEDING",
                                    "WEEKEST_LINK_SEEDING",
                                    "ULTRA_RANDOM_SEEDING",
                                    "TCO05_SEEDING",
                                    "DARTBOARD_SEEDING",
                                    "TCHS_SEEDING",
                                    "ULTRA_RANDOM_DIV2_SEEDING"
                                )
                            ),
                            type = parseInt(params.type, 10),
                            error = helper.checkPositiveInteger(type, "type")
                                    || helper.checkContains(seedings, type, "type");
                        cb(error, type);
                    }
                ],
                isByDivision: [
                    'admin',
                    checkFlag(params.isByDivision, "isByDivision")
                ],
                isByRegion: [
                    'admin',
                    checkFlag(params.isByRegion, "isByRegion")
                ],
                isFinal: [
                    'admin',
                    checkFlag(params.isFinal, "isFinal")
                ],
                p: [
                    'admin',
                    function (cb) {
                        var min = -0.9999999999499999e8,
                            max = 0.9999999999499999e8,
                            p = parseFloat(params.p),
                            error = _.isNaN(p) ? new IllegalArgumentError("p must be a floating point number.")
                                    : min <= p && p <= max ? null
                                        : new IllegalArgumentError("Precision of p must not exceed (10,2).");
                        cb(error, p);
                    }
                ],
                sqlParams: _.flatten(
                    [
                        sqlparams,
                        sqlParams(sqlparams, {}, {})
                    ]
                ),
                update: [
                    'exists',
                    'sqlParams',
                    function (cb, results) {
                        api.dataAccess.executeQuery(
                            "srm_update_room_assignment",
                            results.sqlParams,
                            dbConnectionMap,
                            cb
                        );
                    }
                ]
            },
            function (error) {
                if (error) {
                    api.helper.handleError(api, connection, error);
                } else {
                    connection.response = {success: true};
                }
                next(connection, true);
            }
        );
    }
};


/**
 * The API to set round languages
 */
exports.setRoundLanguages = {
    name: "setRoundLanguages",
    description: "Set round languages.",
    inputs: {
        required: ['roundId', 'languages'],
        optional: []
    },
    blockedConnectionTypes: [],
    outputExample: {},
    version: 'v2',
    transaction: 'write',
    databases: ["informixoltp"],
    run: function (api, connection, next) {
        api.log("Execute setRoundLanguages#run", 'debug');
        var helper = api.helper,
            dbConnectionMap = connection.dbConnectionMap,
            params = connection.params,
            PARALLELIZATION_LIMIT = 3;
        async.auto(
            {
                admin: function (cb) {
                    cb(helper.checkAdmin(connection, UNAUTHORIZED_MESSAGE, NON_ADMIN_MESSAGE));
                },
                roundId: [
                    'admin',
                    function (cb) {
                        var roundId = parseInt(params.roundId, 10),
                            error = helper.checkIdParameter(roundId, "roundId")
                                 || helper.checkMaxNumber(roundId, MAX_ID, "roundId");
                        cb(error, roundId);
                    }
                ],
                exists: [
                    'roundId',
                    function (cb, results) {
                        async.series(
                            [
                                _.bind(
                                    api.dataAccess.executeQuery,
                                    api.dataAccess,
                                    "check_round_exist",
                                    {roundId: results.roundId},
                                    dbConnectionMap
                                )
                            ],
                            function (error, results) {
                                if (error) {
                                    cb(error);
                                } else {
                                    if (results[0][0].round_exist === 0) {
                                        cb(new IllegalArgumentError("roundId unknown."));
                                    } else {
                                        cb(null, null);
                                    }
                                }
                            }
                        );
                    }
                ],
                knownLanguages: [
                    'admin',
                    function (cb) {
                        api.dataAccess.executeQuery(
                            "srm_get_all_languages",
                            {},
                            dbConnectionMap,
                            cb
                        );
                    }
                ],
                languages: [
                    'knownLanguages',
                    function (cb, results) {
                        var knownLanguages = _.pluck(results.knownLanguages, 'language_id'),
                            languages = params.languages,
                            error = !_.isArray(languages)
                                  ? new IllegalArgumentError("languages must be an array.")
                                  : languages.length > knownLanguages.length
                                  ? new IllegalArgumentError("Array size exceeds number of known languages.")
                                  : null;
                        if (error) {
                            cb(error);
                        } else {
                            if (
                                _.find(
                                    languages,
                                    function (language) {
                                        error = helper.checkContains(knownLanguages, language, "language");
                                        return error;
                                    }
                                )
                            ) {
                                cb(error);
                            } else {
                                // remove duplicates
                                cb(null, _.uniq(languages.sort(), true));
                            }
                        }
                    }

                ],
                clear: [
                    'exists',
                    'languages',
                    function (cb, results) {
                        api.dataAccess.executeQuery(
                            "srm_clear_round_languages",
                            {roundId: results.roundId},
                            dbConnectionMap,
                            cb
                        );
                    }
                ],
                insert: [
                    'clear',
                    function (cb, results) {
                        async.eachLimit(
                            results.languages,
                            PARALLELIZATION_LIMIT,
                            function (language, cbx) {
                                api.dataAccess.executeQuery(
                                    "srm_insert_round_language",
                                    {roundId: results.roundId, languageId: language},
                                    dbConnectionMap,
                                    cbx
                                );
                            },
                            cb
                        );
                    }
                ]
            },
            function (error) {
                if (error) {
                    api.helper.handleError(api, connection, error);
                } else {
                    connection.response = {success: true};
                }
                next(connection, true);
            }
        );
    }
};


/**
 * The API to set round events
 */
exports.setRoundEvents = {
    name: "setRoundEvents",
    description: "Set round events.",
    inputs: {
        required: ['roundId', 'eventId'],
        optional: ['eventName', 'registrationUrl']
    },
    blockedConnectionTypes: [],
    outputExample: {},
    version: 'v2',
    transaction: 'write',
    databases: ["informixoltp"],
    run: function (api, connection, next) {
        api.log("Execute setRoundEvents#run", 'debug');
        var helper = api.helper,
            dbConnectionMap = connection.dbConnectionMap,
            sqlparams = ['roundId', 'eventId', 'eventName', 'registrationUrl'],
            params = connection.params;

        async.auto(
            {
                admin: function (cb) {
                    cb(helper.checkAdmin(connection, UNAUTHORIZED_MESSAGE, NON_ADMIN_MESSAGE));
                },
                roundId: [
                    'admin',
                    function (cb) {
                        var roundId = parseInt(params.roundId, 10),
                            error = helper.checkIdParameter(roundId, "roundId")
                                 || helper.checkMaxNumber(roundId, MAX_ID, "roundId");
                        cb(error, roundId);
                    }
                ],
                exists: [
                    'roundId',
                    function (cb, results) {
                        async.series(
                            [
                                _.bind(
                                    api.dataAccess.executeQuery,
                                    api.dataAccess,
                                    "check_round_exist",
                                    {roundId: results.roundId},
                                    dbConnectionMap
                                )
                            ],
                            function (error, results) {
                                if (error) {
                                    cb(error);
                                } else {
                                    if (results[0][0].round_exist === 0) {
                                        cb(new IllegalArgumentError("roundId unknown."));
                                    } else {
                                        cb(null, null);
                                    }
                                }
                            }
                        );
                    }
                ],
                eventId: [
                    'admin',
                    function (cb) {
                        var eventId = parseInt(params.eventId, 10),
                            error = helper.checkIdParameter(eventId, "eventId")
                                 || helper.checkMaxNumber(eventId, MAX_ID, "eventId");
                        cb(error, eventId);
                    }
                ],
                eventName: [
                    'admin',
                    function (cb) {
                        var eventName = _.isUndefined(params.eventName) ? null : params.eventName,
                            error = _.isNull(eventName) ? null
                                  : helper.checkStringPopulated(eventName, "eventName")
                                    || helper.checkMaxNumber(eventName.length, 50, "Length of eventName")
                                    || checkIllegalCharacters(eventName, "eventName");
                        cb(error, eventName);
                    }
                ],
                registrationUrl: [
                    'admin',
                    function (cb) {
                        var registrationUrl = _.isUndefined(params.registrationUrl) ? null : params.registrationUrl,
                            error = _.isNull(registrationUrl) ? null
                                  : helper.checkStringPopulated(registrationUrl, "registrationUrl")
                                    || helper.checkMaxNumber(registrationUrl.length, 255, "Length of registrationUrl")
                                    || checkIllegalCharacters(registrationUrl, "registrationUrl");
                        cb(error, registrationUrl);
                    }
                ],
                sqlParams: _.flatten(
                    [
                        sqlparams,
                        sqlParams(
                            sqlparams,
                            {
                                eventName: true,
                                registrationUrl: true
                            },
                            {}
                        )
                    ]
                ),
                clean: [
                    'roundId',
                    'exists',
                    function (cb, results) {
                        api.dataAccess.executeQuery(
                            "srm_clear_round_events",
                            {roundId: results.roundId},
                            dbConnectionMap,
                            cb
                        );
                    }
                ],
                insert: [
                    'clean',
                    'sqlParams',
                    function (cb, results) {
                        api.dataAccess.executeQuery(
                            "srm_insert_round_event",
                            results.sqlParams,
                            dbConnectionMap,
                            cb
                        );
                    }
                ]
            },
            function (error) {
                if (error) {
                    api.helper.handleError(api, connection, error);
                } else {
                    connection.response = {success: true};
                }
                next(connection, true);
            }
        );
    }
};

/**
 * The API to load round access.
 */
exports.loadRoundAccess = {
    name: "loadRoundAccess",
    description: "Load round access.",
    inputs: {
        required: [],
        optional: []
    },
    blockedConnectionTypes: [],
    outputExample: {},
    version: 'v2',
    transaction: 'read', // this action is read-only
    databases: ["informixoltp"],
    run: function (api, connection, next) {
        api.log("Execute loadRoundAccess#run", 'debug');
        var formatDate = function (date) {
            var result = null;
            if (_.isString(date)) {
                result =  moment(date).format(DATE_FORMAT);
            }
            return result;
        };
        async.series(
            [
                function (cb) {
                    cb(api.helper.checkAdmin(connection, UNAUTHORIZED_MESSAGE, NON_ADMIN_MESSAGE));
                },
                function (cb) {
                    var roundTypes = _.values(
                        _.pick(
                            CONTEST_CONSTANTS,
                            'SRM_ROUND_TYPE_ID',
                            'TOURNAMENT_ROUND_TYPE_ID',
                            'SRM_QA_ROUND_TYPE_ID',
                            'PRIVATE_LABEL_TOURNAMENT_ROUND_TYPE_ID',
                            'LONG_ROUND_TYPE_ID',
                            'TEAM_SRM_ROUND_TYPE_ID',
                            'TEAM_TOURNAMENT_ROUND_TYPE_ID',
                            'WEAKEST_LINK_ROUND_TYPE_ID',
                            'HS_SRM_ROUND_TYPE_ID',
                            'HS_TOURNAMENT_ROUND_TYPE_ID',
                            'MODERATED_CHAT_ROUND_TYPE_ID',
                            'LONG_PROBLEM_ROUND_TYPE_ID',
                            'LONG_PROBLEM_QA_ROUND_TYPE_ID',
                            'INTRO_EVENT_ROUND_TYPE_ID',
                            'LONG_PROBLEM_TOURNAMENT_ROUND_TYPE_ID',
                            'EDUCATION_ALGO_ROUND_TYPE_ID',
                            'AMD_LONG_PROBLEM_ROUND_TYPE_ID'
                        )
                    ).join();
                    api.dataAccess.executeQuery(
                        "srm_get_accessible_rounds",
                        {roundTypes: roundTypes},
                        connection.dbConnectionMap,
                        cb
                    );
                }

            ],
            function (error, results) {
                if (error) {
                    api.helper.handleError(api, connection, error);
                } else {
                    if (results[1] && results[1].length > 0) {
                        connection.response = {
                            accessibleRounds: _.map(
                                results[1],
                                function (round) {
                                    return _.reduce(
                                        {
                                            roundId: (_.isNull(round.round_id) || _.isUndefined(round.round_id))
                                                  ? null : round.round_id,
                                            name: round.name,
                                            startDate: formatDate(round.start_time)
                                        },
                                        function (memo, value, key) {
                                            if (!_.isNull(value)) {memo[key] = value; }
                                            return memo;
                                        },
                                        {}
                                    );
                                }
                            )
                        };
                    } else {
                        connection.response = [];
                    }
                }
                next(connection, true);
            }
        );
    }
};

/**
 * The problem id filter for srm practice problems api.
 * @since 1.8
 */
var PROBLEM_ID_FILTER = " AND problem_id = @filter@\n";

/**
 * The problem name filter for srm practice problems api.
 * @since 1.8
 */
var PROBLEM_NAME_FILTER = " AND LOWER(problem_name) LIKE LOWER('@filter@')\n";

/**
 * The problem type filter for srm practice problems api.
 * @since 1.8
 */
var PROBLEM_TYPE_FILTER = " AND LOWER(problem_type) IN (@filter@)\n";

/**
 * Difficulty filter for srm practice problems api.
 * @since 1.8
 */
var DIFFICULTY_FILTER = " AND LOWER(difficulty) IN (@filter@)\n";

/**
 * The points lower bound filter for srm practice problems api.
 * @since 1.8
 */
var POINTS_LOWER_BOUND_FILTER = " AND points >= @filter@\n";

/**
 * The points upper bound filter for srm practice problems api.
 * @since 1.8
 */
var POINTS_UPPER_BOUND_FILTER = " AND points <= @filter@\n";

/**
 * The status filter for srm practice problems api.
 * @since 1.8
 */
var STATUS_FILTER = " AND LOWER(srp.status) IN (@filter@)\n";

/**
 * The myPoints lower bound filter for srm practice problems api.
 * @since 1.8
 */
var MY_POINTS_UPPER_BOUND_FILTER = "AND srp.my_points <= @filter@\n";

/**
 * The myPoints lower bound filter for srm practice problems api.
 * @since 1.8
 */
var MY_POINTS_LOWER_BOUND_FILTER = " AND srp.my_points >= @filter@\n";

/**
 * Valid sort column array for srm practice problems api.
 * @since 1.8
 */
var VALID_PRACTICE_PROBLEMS_SORT_COLUMN = ['problemId', 'problemName', 'problemType', 'difficulty', 'points', 'status',
    'myPoints'];

/**
 * Valid status value for srm practice problems api.
 * @since 1.8
 */
var VALID_PRACTICE_PROBLEMS_STATUS = ['new', 'viewed', 'solved'];

/**
 * Valid difficulty value for srm practice problems api.
 * @since 1.8
 */
var VALID_PRACTICE_PROBLEMS_DIFFICULTY = ['easy', 'medium', 'hard'];

/**
 * Valid type value for srm practice problems api.
 * @since 1.8
 */
var VALID_PRACTICE_PROBLEMS_TYPE = ['single', 'team', 'long'];

/**
 * Add filter for query based on given connection parameters.
 * This method will add additional filter into sql query based on input parameters of srm practice problems api.
 *
 * @param {String} query - The sql query that will be executed.
 * @param {Object} parameters - The input parameters.
 * @param {Object} helper - The helper object.
 * @return {String} The query with additional filter.
 * @since 1.8
 */
function addFilter(query, parameters, helper) {
    if (!_.isUndefined(parameters.problemId)) {
        query = helper.editSql(query, PROBLEM_ID_FILTER, Number(parameters.problemId));
    }
    if (!_.isUndefined(parameters.problemName)) {
        query = helper.editSql(query, PROBLEM_NAME_FILTER, '%' + parameters.problemName.toLowerCase() + '%');
    }

    if (!_.isUndefined(parameters.problemTypes)) {
        query = helper.editSql(query, PROBLEM_TYPE_FILTER,
            parameters.problemTypes.split(',').map(function (s) { return "'" + s.toLowerCase().trim() + "'"; }).join(','));
    }

    if (!_.isUndefined(parameters.difficulty)) {
        query = helper.editSql(query, DIFFICULTY_FILTER,
            parameters.difficulty.split(',').map(function (s) { return "'" + s.toLowerCase().trim() + "'"; }).join(','));
    }

    if (!_.isUndefined(parameters.pointsLowerBound)) {
        query = helper.editSql(query, POINTS_LOWER_BOUND_FILTER, Number(parameters.pointsLowerBound));
    }

    if (!_.isUndefined(parameters.pointsUpperBound)) {
        query = helper.editSql(query, POINTS_UPPER_BOUND_FILTER, Number(parameters.pointsUpperBound));
    }

    if (!_.isUndefined(parameters.statuses)) {
        query = helper.editSql(query, STATUS_FILTER,
            parameters.statuses.split(',').map(function (s) { return "'" + s.toLowerCase().trim() + "'"; }).join(','));
    }

    if (!_.isUndefined(parameters.myPointsLowerBound)) {
        query = helper.editSql(query, MY_POINTS_LOWER_BOUND_FILTER, Number(parameters.myPointsLowerBound));
    }

    if (!_.isUndefined(parameters.myPointsUpperBound)) {
        query = helper.editSql(query, MY_POINTS_UPPER_BOUND_FILTER, Number(parameters.myPointsUpperBound));
    }

    return query;
}


/**
 * Handle the get srm practice problems api.
 * This method will validate input parameters for srm practice problems api and return error if the input parameters
 * are invalid.
 * Then executing query based on input filter and put the response in connection object.
 * @param {Object} api - The api object.
 * @param {Object} connection - The connection object.
 * @param {Function} next - The callback function.
 * @since 1.8
 */
function getPracticeProblems(api, connection, next) {
    var helper = api.helper,
        sqlParams,
        response,
        pointsLowerBound,
        pointsUpperBound,
        myPointsLowerBound,
        myPointsUpperBound,
        caller = connection.caller,
        pageIndex = Number(connection.params.pageIndex || 1),
        pageSize = Number(connection.params.pageSize || 10),
        sortColumn = connection.params.sortColumn || 'problemId',
        sortOrder = connection.params.sortOrder || helper.consts.ASCENDING,
        exeQuery = function (query) {
            return function (cbx) {
                api.dataAccess.executeSqlQuery(query, sqlParams, 'informixoltp', connection.dbConnectionMap, cbx);
            };
        };
    async.waterfall([
        function (cb) {
            var error = helper.checkPageIndex(pageIndex, 'pageIndex') ||
                helper.checkPositiveInteger(pageSize, 'pageSize') ||
                helper.checkMaxInt(pageSize, 'pageSize') ||
                helper.checkContains(['asc', 'desc'], sortOrder.toLowerCase(), 'sortOrder') ||
                helper.checkSortColumn(VALID_PRACTICE_PROBLEMS_SORT_COLUMN, sortColumn.toLowerCase()) ||
                helper.checkMember(connection, 'Only logged in user can access to this endpoint.');
            if (!_.isUndefined(connection.params.statuses)) {
                error = error || helper.checkSubset(connection.params.statuses.split(','),
                    VALID_PRACTICE_PROBLEMS_STATUS, 'statuses');
            }

            if (!_.isUndefined(connection.params.problemName)) {
                if (connection.params.problemName.length > 32) {
                    error = error || new IllegalArgumentError('The problemName should less than 32 characters.');
                }
            }

            if (!_.isUndefined(connection.params.difficulty)) {
                error = error || helper.checkSubset(connection.params.difficulty.split(','),
                    VALID_PRACTICE_PROBLEMS_DIFFICULTY, 'difficulty');
            }

            if (!_.isUndefined(connection.params.problemTypes)) {
                error = error || helper.checkSubset(connection.params.problemTypes.split(','),
                    VALID_PRACTICE_PROBLEMS_TYPE, 'problemTypes');
            }

            if (!_.isUndefined(connection.params.pointsLowerBound) || !_.isUndefined(connection.params.pointsUpperBound)) {
                pointsLowerBound = Number(connection.params.pointsLowerBound || 0);
                pointsUpperBound = Number(connection.params.pointsUpperBound || helper.MAX_INT);
                error = error || helper.checkMaxInt(pointsLowerBound, 'pointsLowerBound')
                    || helper.checkNonNegativeInteger(pointsLowerBound, 'pointsLowerBound')
                    || helper.checkPositiveInteger(pointsUpperBound, 'pointsUpperBound')
                    || helper.checkMaxInt(pointsUpperBound, 'pointsUpperBound');
                if (pointsLowerBound > pointsUpperBound) {
                    error = error || new IllegalArgumentError('The pointsLowerBound should less than pointsUpperBound or max value of integer.');
                }
            }

            if (!_.isUndefined(connection.params.myPointsLowerBound) || !_.isUndefined(connection.params.myPointsUpperBound)) {
                myPointsLowerBound = Number(connection.params.myPointsLowerBound || 0);
                myPointsUpperBound = Number(connection.params.myPointsUpperBound || helper.MAX_INT);
                error = error || helper.checkNonNegativeInteger(myPointsLowerBound, 'myPointsLowerBound')
                    || helper.checkMaxInt(myPointsLowerBound, 'myPointsLowerBound')
                    || helper.checkPositiveInteger(myPointsUpperBound, 'myPointsUpperBound')
                    || helper.checkMaxInt(myPointsUpperBound, 'myPointsUpperBound');
                if (myPointsLowerBound > myPointsUpperBound) {
                    error = error || new IllegalArgumentError('The myPointsLowerBound should less than myPointsUpperBound or max value of integer.');
                }
            }

            cb(error);
        },
        function (cb) {
            async.parallel({
                data: function (cbx) {
                    helper.readQuery('get_practice_problems', cbx);
                },
                count: function (cbx) {
                    helper.readQuery('get_practice_problems_count', cbx);
                }
            }, cb);
        },
        function (q, cb) {
            sqlParams = {
                firstRowIndex: (pageIndex - 1) * pageSize,
                pageSize: pageSize,
                sortColumn: helper.getSortColumnDBName(sortColumn),
                sortOrder: sortOrder.toLowerCase(),
                userId: caller.userId
            };

            q.data = addFilter(q.data, connection.params, helper);
            q.count = addFilter(q.count, connection.params, helper);

            async.parallel({
                data: exeQuery(q.data),
                count: exeQuery(q.count)
            }, cb);
        },
        function (results, cb) {
            response = {
                pageIndex: pageIndex,
                pageSize: pageSize,
                total: results.count[0].total_count,
                data: helper.transferDBResults2Response(results.data)
            };
            cb();
        }
    ], function (err) {
        if (err) {
            helper.handleError(api, connection, err);
        } else {
            connection.response = response;
        }
        next(connection, true);
    });
}

/**
 * Get practice problems api.
 * @since 1.8
 */
exports.getPracticeProblems = {
    name: "getPracticeProblems",
    description: "Get SRM Practice Problems",
    inputs: {
        required: [],
        optional: ['pageIndex', 'pageSize', 'sortColumn', 'sortOrder', 'problemId', 'problemName', 'problemTypes',
            'statuses', 'myPointsLowerBound', 'myPointsUpperBound', 'pointsUpperBound', 'pointsLowerBound', 'difficulty']
    },
    blockedConnectionTypes: [],
    outputExample: {},
    version: 'v2',
    transaction: 'read', // this action is read-only
    databases: ["informixoltp"],
    run: function (api, connection, next) {
        if (connection.dbConnectionMap) {
            api.log("Execute getPracticeProblems#run", 'debug');
            getPracticeProblems(api, connection, next);
        } else {
            api.helper.handleNoConnection(api, connection, next);
        }
    }
};

/**
 * getSrmRoundsForProblem implements the rounds for problem api.
 *
 * @param {Object} api - The api object.
 * @param {Object} connection - The connection object.
 * @param {Function} next - The callback function.
 */
function getSrmRoundsForProblem(api, connection, next) {
    // control flow designators
    var problemId = 'problemId',
        checkProblem = 'checkProblem',
        // shortcuts
        helper = api.helper,
        dbConnectionMap = connection.dbConnectionMap,
        dataAccess = _.bind(api.dataAccess.executeQuery, api.dataAccess);
    return async.waterfall(
        [
            function (cb) {
                var id = parseInt(connection.params.problemId, 10),
                    error = helper.checkIdParameter(id, problemId),
                    results = {};
                if (error) {
                    return cb(error);
                }
                results[problemId] = id;
                return cb(null, results);
            },
            function (results, cb) {
                var id = results[problemId];
                dataAccess(
                    'check_problem_exists',
                    {problem_id: id},
                    dbConnectionMap,
                    function (error, result) {
                        if (error) {
                            return cb(error);
                        }
                        results[checkProblem] = result;
                        return cb(null, results);
                    }
                );
            },
            function (results, cb) {
                if (results[checkProblem][0].is_there) {
                    return cb(null, results);
                }
                return cb(new NotFoundError("The problem doesn't exist."));
            },
            function (results, cb) {
                var id = results[problemId];
                return dataAccess(
                    'get_rounds_for_problem',
                    {problem_id: id},
                    dbConnectionMap,
                    function (error, result) {
                        if (error) {
                            return cb(error);
                        }
                        return cb(
                            null,
                            {
                                rounds: helper.transferDBResults2Response(result)
                            }
                        );
                    }
                );
            }
        ],
        function (error, results) {
            if (error) {
                helper.handleError(api, connection, error);
                return next(connection, true);
            }
            connection.response = results;
            return next(connection, true);
        }
    );
}

/**
 * Rounds For Problem API
 *
 * This api returns the rounds that used the given problem (identified by problem id).
 * This api will exclude the practice rounds.
 * This api includes only finished rounds
 *
 * @since 1.9
 */
exports.getSrmRoundsForProblem = {
    name: "getSrmRoundsForProblem",
    description: "SRM Rounds For Problem API",
    inputs: {
        required: ['problemId'],
        optional: []
    },
    blockedConnectionTypes: [],
    outputExample: {},
    version: 'v2',
    transaction: 'read', // this action is read-only
    databases: ["informixoltp"],
    run: function (api, connection, next) {
        if (connection.dbConnectionMap) {
            api.log("Execute getSrmRoundsForProblem", 'debug');
            return getSrmRoundsForProblem(api, connection, next);
        }
        return api.helper.handleNoConnection(api, connection, next);
    }
};
