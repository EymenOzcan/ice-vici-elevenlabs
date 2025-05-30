/*
 * Asterisk -- An open source telephony toolkit.
 *
 * Copyright (C) 2019, CyCore Systems, Inc
 *
 * Seán C McCord <scm@cycoresys.com>
 *
 * See http://www.asterisk.org for more information about
 * the Asterisk project. Please do not directly contact
 * any of the maintainers of this project for assistance;
 * the project provides a web site, mailing lists and IRC
 * channels for your use.
 *
 * This program is free software, distributed under the terms of
 * the GNU General Public License Version 2. See the LICENSE file
 * at the top of the source tree.
 */

/*! \file
 *
 * \brief AudioSocket application -- transmit and receive audio through a TCP socket
 *
 * \author Seán C McCord <scm@cycoresys.com>
 *
 * \ingroup applications
 */

/*** MODULEINFO
        <depend>res_audiosocket</depend>
        <support_level>extended</support_level>
 ***/

#include "asterisk.h"
#include "errno.h"
// #include <uuid/uuid.h> // Remove UUID include

#include "asterisk/file.h"
#include "asterisk/module.h"
#include "asterisk/channel.h"
#include "asterisk/app.h"
#include "asterisk/res_audiosocket.h"
#include "asterisk/utils.h"
#include "asterisk/manager.h"

// #include "asterisk/format_cache.h"

#define AST_MODULE "app_audiosocket"
#define AUDIOSOCKET_CONFIG "audiosocket.conf"
#define MAX_CONNECT_TIMEOUT_MSEC 2000

/*** DOCUMENTATION
        <application name="AudioSocket" language="en_US">
                <synopsis>
                        Transmit and receive audio between channel and TCP socket
                </synopsis>
                <syntax>
                        <parameter name="id" required="true">
                                <para>ID is the universally-unique identifier of the call for the audio socket service.  This ID must conform to the string form of a standard UUID.</para>
                        </parameter>
                        <parameter name="service" required="true">
                                <para>Service is the name or IP address and port number of the audio socket service to which this call should be connected.  This should be in the form host:port, such as myserver:9019 </para>
                        </parameter>
                </syntax>
                <description>
                        <para>Connects to the given TCP service, then transmits channel audio over that socket.  In turn, audio is received from the socket and sent to the channel.  Only audio frames will be transmitted.</para>
                        <para>Protocol is specified at https://wiki.asterisk.org/wiki/display/AST/AudioSocket</para>
                        <para>This application does not automatically answer and should generally be preceeded by an application such as Answer() or Progress().</para>
                </description>
        </application>
 ***/

static const char app[] = "AudioSocket";

static int audiosocket_run(struct ast_channel *chan, const char *id, const int svc);

static int audiosocket_exec(struct ast_channel *chan, const char *data)
{
        char *parse;
        struct ast_format *readFormat, *writeFormat;
        const char *chanName;
        int res;

        AST_DECLARE_APP_ARGS(args,
                AST_APP_ARG(idStr);
                AST_APP_ARG(server);
        );

        int s = 0;

        chanName = ast_channel_name(chan);

        /* Parse and validate arguments */
        parse = ast_strdupa(data);
        AST_STANDARD_APP_ARGS(args, parse);
        if (ast_strlen_zero(args.idStr)) {
        ast_log(LOG_ERROR, "ID is required\n");
                return -1;
        }
        if ((s = ast_audiosocket_connect(args.server, chan)) < 0) {
                /* The res module will already output a log message, so another is not needed */
                return -1;
        }

        /* Store original formats */
        writeFormat = ast_channel_writeformat(chan);
        readFormat = ast_channel_readformat(chan);

        /* Get SLINEAR format */
        struct ast_format slin_format;
        ast_format_set(&slin_format, AST_FORMAT_SLINEAR, 0);

        if (ast_set_write_format(chan, &slin_format)) {
                ast_log(LOG_ERROR, "Failed to set write format to SLINEAR for channel %s\n", chanName);
                return -1;
        }
        if (ast_set_read_format(chan, &slin_format)) {
                ast_log(LOG_ERROR, "Failed to set read format to SLINEAR for channel %s\n", chanName);

                /* Attempt to restore previous write format even though it is likely to
                 * fail, since setting the read format did.
                 */
                if (ast_set_write_format(chan, writeFormat)) {
                        ast_log(LOG_ERROR, "Failed to restore write format for channel %s\n", chanName);
                }
                return -1;
        }

        res = audiosocket_run(chan, args.idStr, s);
        /* On non-zero return, report failure */
        if (res) {
                /* Restore previous formats and close the connection */
                if (ast_set_write_format(chan, writeFormat)) {
                        ast_log(LOG_ERROR, "Failed to restore write format for channel %s\n", chanName);
                }
                if (ast_set_read_format(chan, readFormat)) {
                        ast_log(LOG_ERROR, "Failed to restore read format for channel %s\n", chanName);
                }
                close(s);
                return res;
        }
        close(s);

        if (ast_set_write_format(chan, writeFormat)) {
                ast_log(LOG_ERROR, "Failed to restore write format for channel %s\n", chanName);
        }
        if (ast_set_read_format(chan, readFormat)) {
                ast_log(LOG_ERROR, "Failed to restore read format for channel %s\n", chanName);
        }

        return 0;
}

static int audiosocket_run(struct ast_channel *chan, const char *id, int svc)
{
        const char *chanName;
        struct ast_channel *targetChan;
        int ms = 0;
        int outfd = 0;
        struct ast_frame *f;

        if (!chan || ast_channel_state(chan) != AST_STATE_UP) {
                return -1;
        }

        if (ast_audiosocket_init(svc, id)) {
                return -1;
        }

        chanName = ast_channel_name(chan);

        while (1) {
                ms = -1;
                targetChan = ast_waitfor_nandfds(&chan, 1, &svc, 1, NULL, &outfd, &ms);
                if (targetChan) {
                        f = ast_read(chan);
                        if (!f) {
                                return -1;
                        }

                        if (f->frametype == AST_FRAME_VOICE) {
                                /* Send audio frame to audiosocket */
                                if (ast_audiosocket_send_frame(svc, f)) {
                                        ast_log(LOG_ERROR, "Failed to forward channel frame from %s to AudioSocket\n",
                                                chanName);
                                        ast_frfree(f);
                                        return -1;
                                }
                        }
                        ast_frfree(f);
                }

                if (outfd >= 0) {
                        f = ast_audiosocket_receive_frame(svc);
                        if (!f) {
                                ast_log(LOG_ERROR, "Failed to receive frame from AudioSocket message for"
                                        "channel %s\n", chanName);
                                return -1;
                        }
                        if (ast_write(chan, f)) {
                                ast_log(LOG_WARNING, "Failed to forward frame to channel %s\n", chanName);
                                ast_frfree(f);
                                return -1;
                        }
                        ast_frfree(f);
                }
        }
        return 0;
}

static int manager_audiosocket(struct mansession *s, const struct message *m)
{
    struct ast_channel *c;
    const char *name = astman_get_header(m, "Channel");
    const char *action_id = astman_get_header(m, "ActionID");
    const char *id = astman_get_header(m, "Id");
    const char *server = astman_get_header(m, "Server");
    int res;
    char args[PATH_MAX];

    if (ast_strlen_zero(name)) {
        astman_send_error(s, m, "No channel specified");
        return 0;
    }

    c = ast_channel_get_by_name(name);
    if (!c) {
        astman_send_error(s, m, "No such channel");
        return 0;
    }

    snprintf(args, sizeof(args), "%s,%s", id, server);

    res = audiosocket_exec(c, args);

    if (res) {
        ast_channel_unref(c);
        astman_send_error(s, m, "Could not start Audiosocket");
        return 0;
    }

    astman_append(s, "Response: Success\r\n");

    if (!ast_strlen_zero(action_id)) {
        astman_append(s, "ActionID: %s\r\n", action_id);
    }

    astman_append(s, "\r\n");

    ast_channel_unref(c);

    return 0;
}

static int unload_module(void)
{
        return ast_unregister_application(app);
}

static int load_module(void)
{
    int res;
    res = ast_register_application_xml(app, audiosocket_exec);
    res |= ast_manager_register_xml("Audiosocket", EVENT_FLAG_SYSTEM, manager_audiosocket);
    return res;
}

AST_MODULE_INFO(
        ASTERISK_GPL_KEY,
        AST_MODFLAG_LOAD_ORDER,
        "AudioSocket Application",
        .load = load_module,
        .unload = unload_module,
        .load_pri = AST_MODPRI_CHANNEL_DRIVER,
);

