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
 * \author Seán C McCord <scm@cycoresys.com>
 *
 * \brief AudioSocket Channel
 *
 * \ingroup channel_drivers
 */

/*** MODULEINFO
	<depend>res_audiosocket</depend>
	<support_level>extended</support_level>
 ***/

#include "asterisk.h"

#define AST_MODULE "chan_audiosocket"

#include "asterisk/channel.h"
#include "asterisk/module.h"
#include "asterisk/res_audiosocket.h"
#include "asterisk/pbx.h"
#include "asterisk/acl.h"
#include "asterisk/app.h"
#include "asterisk/causes.h"

#define FD_OUTPUT 1	/* A fd of -1 means an error, 0 is stdin */

struct audiosocket_instance {
	int svc;	/* The file descriptor for the AudioSocket instance */
	char id[38];	/* The UUID identifying this AudioSocket instance */
} audiosocket_instance;

/* Forward declarations */
static int ast_sockaddr_resolve_first_af(struct ast_sockaddr *addr,
                                      const char *name, int flag, int family);


static struct ast_channel *audiosocket_request(const char *type, struct ast_format_cap *cap, const struct ast_channel *requestor, const char *data, int *cause);
static int audiosocket_call(struct ast_channel *ast, const char *dest, int timeout);
static int audiosocket_hangup(struct ast_channel *ast);
static struct ast_frame *audiosocket_read(struct ast_channel *ast);
static int audiosocket_write(struct ast_channel *ast, struct ast_frame *f);

/* AudioSocket channel driver declaration */
static struct ast_channel_tech audiosocket_channel_tech = {
	.type = "AudioSocket",
	.description = "AudioSocket Channel Driver",
	.requester = audiosocket_request,
	.call = audiosocket_call,
	.hangup = audiosocket_hangup,
	.read = audiosocket_read,
	.write = audiosocket_write,
};

/*! \brief Function called when we should read a frame from the channel */
static struct ast_frame *audiosocket_read(struct ast_channel *ast)
{
	struct audiosocket_instance *instance;

	/* The channel should always be present from the API */
	instance = ast_channel_tech_pvt(ast);
	if (instance == NULL || instance->svc < FD_OUTPUT) {
		return NULL;
	}
	return ast_audiosocket_receive_frame(instance->svc);
}

/*! \brief Function called when we should write a frame to the channel */
static int audiosocket_write(struct ast_channel *ast, struct ast_frame *f)
{
	struct audiosocket_instance *instance;

	/* The channel should always be present from the API */
	instance = ast_channel_tech_pvt(ast);
	if (instance == NULL || instance->svc < 1) {
		return -1;
	}
	return ast_audiosocket_send_frame(instance->svc, f);
}

/*! \brief Function called when we should actually call the destination */
static int audiosocket_call(struct ast_channel *ast, const char *dest, int timeout)
{
	struct audiosocket_instance *instance = ast_channel_tech_pvt(ast);

	ast_queue_control(ast, AST_CONTROL_ANSWER);

	return ast_audiosocket_init(instance->svc, instance->id);
}

/*! \brief Function called when we should hang the channel up */
static int audiosocket_hangup(struct ast_channel *ast)
{
	struct audiosocket_instance *instance;

	/* The channel should always be present from the API */
	instance = ast_channel_tech_pvt(ast);
	if (instance != NULL && instance->svc > 0) {
		close(instance->svc);
	}

	ast_channel_tech_pvt_set(ast, NULL);
	ast_free(instance);

	return 0;
}

/*! \brief Function called when we should prepare to call the unicast destination */
static struct ast_channel *audiosocket_request(const char *type,
	struct ast_format_cap *cap, const struct ast_channel *requestor, const char *data, int *cause)
{
	char *parse;
	struct audiosocket_instance *instance = NULL;
	struct ast_sockaddr address;
	struct ast_channel *chan;
	int fd;
	struct ast_format fmt;

	AST_DECLARE_APP_ARGS(args,
		AST_APP_ARG(destination);
		AST_APP_ARG(idStr);
	);

	if (ast_strlen_zero(data)) {
		ast_log(LOG_ERROR, "Destination is required for the 'AudioSocket' channel\n");
		goto failure;
	}
	parse = ast_strdupa(data);
	AST_NONSTANDARD_APP_ARGS(args, parse, '/');

	if (ast_strlen_zero(args.destination)) {
		ast_log(LOG_ERROR, "Destination is required for the 'AudioSocket' channel\n");
		goto failure;
	}
	if (ast_sockaddr_resolve_first_af
		(&address, args.destination, PARSE_PORT_REQUIRE, AST_AF_UNSPEC)) {
		ast_log(LOG_ERROR, "Destination '%s' could not be parsed\n", args.destination);
		goto failure;
	}

	if (ast_strlen_zero(args.idStr)) {
        ast_log(LOG_ERROR, "ID is required for the 'AudioSocket' channel\n");
		goto failure;
	}

	instance = ast_calloc(1, sizeof(*instance));
	if (!instance) {
		ast_log(LOG_ERROR, "Failed to allocate AudioSocket channel pvt\n");
		goto failure;
	}
	ast_copy_string(instance->id, args.idStr, sizeof(instance->id));

	if ((fd = ast_audiosocket_connect(args.destination, NULL)) < 0) {
		goto failure;
	}
	instance->svc = fd;

	chan = ast_channel_alloc(1, AST_STATE_DOWN, "", "", "", "", "", requestor, 0, 
		"AudioSocket/%s-%s", args.destination, args.idStr);
	if (!chan) {
		goto failure;
	}
	ast_channel_set_fd(chan, 0, fd);

	ast_channel_tech_set(chan, &audiosocket_channel_tech);

	/* We only support signed linear format */
	ast_format_clear(&fmt);
	ast_format_set(&fmt, AST_FORMAT_SLINEAR, 0);
	ast_channel_nativeformats_set(chan, ast_format_cap_alloc());
	/* Add the signed linear format to the native formats */
	ast_format_cap_add(ast_channel_nativeformats(chan), &fmt);
	ast_set_write_format(chan, &fmt);
	ast_set_read_format(chan, &fmt);

	ast_channel_tech_pvt_set(chan, instance);

    pbx_builtin_setvar_helper(chan, "AUDIOSOCKET_ID", args.idStr);
	pbx_builtin_setvar_helper(chan, "AUDIOSOCKET_SERVICE", args.destination);

	ast_channel_unlock(chan);

	return chan;

failure:
	*cause = AST_CAUSE_FAILURE;
	if (instance != NULL) {
		ast_free(instance);
		if (fd >= 0) {
			close(fd);
		}
	}
	return NULL;
}


/*! \brief  Return the first entry from ast_sockaddr_resolve filtered by address family
 *
 * \warning Using this function probably means you have a faulty design.
 */
static int ast_sockaddr_resolve_first_af(struct ast_sockaddr *addr,
                                      const char* name, int flag, int family)
{
        struct ast_sockaddr *addrs;
        int addrs_cnt;

        addrs_cnt = ast_sockaddr_resolve(&addrs, name, flag, family);
        if (addrs_cnt <= 0) {
                return 1;
        }
        if (addrs_cnt > 1) {
                ast_debug(1, "Multiple addresses, using the first one only\n");
        }

        ast_sockaddr_copy(addr, &addrs[0]);

        ast_free(addrs);
        return 0;
}

/*! \brief Function called when our module is unloaded */
static int unload_module(void)
{
	ast_channel_unregister(&audiosocket_channel_tech);
	ao2_cleanup(audiosocket_channel_tech.capabilities);
	audiosocket_channel_tech.capabilities = NULL;

	return 0;
}

/*! \brief Function called when our module is loaded */
static int load_module(void)
{
	struct ast_format fmt;
	
	/* Initialize capabilities */
	if (!(audiosocket_channel_tech.capabilities = ast_format_cap_alloc())) {
		return -1;
	}
	
	/* We only support signed linear format */
	ast_format_clear(&fmt);
	ast_format_set(&fmt, AST_FORMAT_SLINEAR, 0);
	ast_format_cap_add(audiosocket_channel_tech.capabilities, &fmt);

	if (ast_channel_register(&audiosocket_channel_tech)) {
		ast_log(LOG_ERROR, "Unable to register channel class AudioSocket");
		ao2_ref(audiosocket_channel_tech.capabilities, -1);
		audiosocket_channel_tech.capabilities = NULL;
		return -1;
	}
	return 0;
}

AST_MODULE_INFO(ASTERISK_GPL_KEY, AST_MODFLAG_LOAD_ORDER,
	"AudioSocket Channel",
	.load = load_module,
	.unload = unload_module,
	.load_pri = AST_MODPRI_CHANNEL_DRIVER
);
